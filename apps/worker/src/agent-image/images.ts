// The projects' own agent images in the worker. It builds what the settings saved, and gives each
// run the image its project's agents use.
import {
  agentImageRepository,
  finishAgentImage,
  markAgentImageBuilding,
  readAgentImage,
  retagAppliedAgentImage,
  unfinishedAgentImages,
  writeAgentImageOutput,
  type AgentImageRow,
  DockerImages,
  imageSetting,
  type AppliedAgentImage,
  type ContainerRuntime,
  type Db,
} from '@union/core';

import { defaultProvisionConfig, type ProvisionConfig } from '../provision';
import { dockerfileTag, makeAgentImage, pullImage, type ImageDeps } from './build';
import { ignoreLines, OutputLog } from './output-log';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AgentImages {
  /** The build of each project's latest save, stopped by the next one. */
  private readonly running = new Map<number, AbortController>();
  /** Rebuilds of an applied Dockerfile on a newer base image, shared by the runs that wait on one. */
  private readonly rebuilding = new Map<string, Promise<string>>();
  private readonly stopped = new AbortController();
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly db: Db,
    private readonly deps: ImageDeps,
  ) {}

  /** At start: the saves a stopped worker had not finished are built again. */
  recover(): void {
    for (const row of unfinishedAgentImages(this.db)) {
      this.sync(row.projectId);
    }
  }

  /** Resolves once the builds in progress have ended. */
  async idle(): Promise<void> {
    await Promise.all(this.inFlight);
  }

  /** Stops the builds in progress (the worker is stopping); their saves stay queued for `recover`. */
  stop(): void {
    this.stopped.abort();
  }

  /**
   * Brings the project's image in line with its row: stops a build no longer wanted, builds what is
   * saved, and removes the images of a project that was deleted.
   */
  sync(projectId: number): void {
    this.running.get(projectId)?.abort();
    this.running.delete(projectId);
    const row = readAgentImage(this.db, projectId);
    if (!row) {
      void this.dropTags(projectId, null);
      return;
    }
    if (row.status !== 'queued' && row.status !== 'building') {
      return;
    }
    const controller = new AbortController();
    this.running.set(projectId, controller);
    this.track(this.applyThenForget(row, controller));
  }

  /** The image the project's agents run on; an applied Dockerfile is built again on a newer base image. */
  async imageFor(projectId: number): Promise<string> {
    const applied = readAgentImage(this.db, projectId)?.applied ?? null;
    if (!applied) {
      return this.deps.baseImages['union-agent'];
    }
    if (applied.kind === 'image') {
      if (!(await this.deps.images.inspect(applied.ref))) {
        await pullImage(this.deps, applied.ref, ignoreLines, this.stopped.signal);
      }
      return applied.ref;
    }
    const tag = await dockerfileTag(this.deps, projectId, applied.dockerfile);
    if (await this.deps.images.inspect(tag)) {
      return tag;
    }
    const shared = this.rebuilding.get(tag) ?? this.rebuild(projectId, applied, tag);
    this.rebuilding.set(tag, shared);
    try {
      return await shared;
    } finally {
      this.rebuilding.delete(tag);
    }
  }

  private async rebuild(
    projectId: number,
    applied: AppliedAgentImage & { kind: 'dockerfile' },
    tag: string,
  ): Promise<string> {
    const log = new OutputLog(ignoreLines);
    try {
      const target = { projectId, source: applied };
      const made = await makeAgentImage(
        this.deps,
        target,
        (line) => {
          log.add(line);
        },
        this.stopped.signal,
      );
      retagAppliedAgentImage(this.db, projectId, { ...applied, tag, sizeBytes: made.sizeBytes });
      void this.dropTags(projectId, tag);
      return tag;
    } catch (error) {
      throw new Error(
        `The project's agent image could not be built again on the new base image: ${messageOf(error)}\n${log.tail()}`,
        { cause: error },
      );
    }
  }

  /** Keeps `work` for `idle` until it ends. */
  private track(work: Promise<void>): void {
    this.inFlight.add(work);
    const forget = async (): Promise<void> => {
      try {
        await work;
      } finally {
        this.inFlight.delete(work);
      }
    };
    void forget();
  }

  private async applyThenForget(row: AgentImageRow, controller: AbortController): Promise<void> {
    try {
      await this.apply(row, AbortSignal.any([controller.signal, this.stopped.signal]));
    } finally {
      if (this.running.get(row.projectId) === controller) {
        this.running.delete(row.projectId);
      }
    }
  }

  private async apply(row: AgentImageRow, signal: AbortSignal): Promise<void> {
    const { projectId, savedAt, pending } = row;
    if (!pending || !markAgentImageBuilding(this.db, projectId, savedAt)) {
      return;
    }
    const target = { projectId, savedAt };
    const log = new OutputLog((lines) => {
      writeAgentImageOutput(this.db, projectId, savedAt, lines);
    });
    try {
      const applied =
        pending.kind === 'default'
          ? null
          : await makeAgentImage(
              this.deps,
              { projectId, source: pending },
              (line) => {
                log.add(line);
              },
              signal,
            );
      log.flush();
      finishAgentImage(this.db, target, { applied });
      void this.dropTags(projectId, applied?.tag ?? null);
    } catch (error) {
      log.flush();
      // A newer save, a discard or the worker stopping: the row is no longer this build's to write.
      if (!signal.aborted) {
        finishAgentImage(this.db, target, { error: messageOf(error) });
      }
    }
  }

  /** Removes the project's built images but `keep`; one a container still uses stays. */
  private async dropTags(projectId: number, keep: string | null): Promise<void> {
    try {
      const tags = await this.deps.images.tags(agentImageRepository(projectId));
      for (const tag of tags.filter((candidate) => candidate !== keep)) {
        await this.deps.images.remove(tag);
      }
    } catch {
      // Left for the next apply: an image kept costs disk, not correctness.
    }
  }
}

/** The worker's provision config, with each project's agents on the image `AgentImages` gives. */
export function agentImageProvision(
  db: Db,
  runtime: ContainerRuntime,
): { config: ProvisionConfig; agentImages: AgentImages } {
  // Getters: a change of the images in Union settings applies to the next build and container.
  const agentImages = new AgentImages(db, {
    runtime,
    images: new DockerImages(),
    baseImages: {
      get 'union-agent'(): string {
        return imageSetting(db, 'agentImage');
      },
      get 'union-agent-base'(): string {
        return imageSetting(db, 'agentBaseImage');
      },
    },
  });
  return {
    config: defaultProvisionConfig(db, (projectId) => agentImages.imageFor(projectId)),
    agentImages,
  };
}
