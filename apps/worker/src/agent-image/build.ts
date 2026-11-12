// Makes a project's agent image from what the user saved: the Dockerfile built on the base images,
// or the image pulled. Then it is checked.
import {
  agentImageTag,
  buildableDockerfile,
  dockerfileBases,
  type AgentImageBase,
  type AgentImageSource,
  type AppliedAgentImage,
  type ContainerRuntime,
  type ExecResult,
  type ImageRuntime,
} from '@union/core';

import { checkAgentImage } from './check';

export type ImageDeps = {
  runtime: ContainerRuntime;
  images: ImageRuntime;
  /**
   * The images a Dockerfile's `FROM union-agent` and `FROM union-agent-base` start from
   * (`union-agent:local`, `union-agent-base:local`); `union-agent` is also the default image.
   */
  baseImages: Readonly<Record<AgentImageBase, string>>;
};

type OwnSource = Exclude<AgentImageSource, { kind: 'default' }>;

/** Drains a docker output stream into `onLine`; throws with `what` when it exits non-zero. */
async function drain(
  output: AsyncGenerator<string, ExecResult>,
  onLine: (line: string) => void,
  what: string,
): Promise<void> {
  let next = await output.next();
  while (!next.done) {
    onLine(next.value);
    next = await output.next();
  }
  if (next.value.exitCode !== 0) {
    throw new Error(`${what} failed (exit ${next.value.exitCode}): see the log`);
  }
}

/** The id of a base image, which must exist. */
async function baseImageId(deps: ImageDeps, base: AgentImageBase): Promise<string> {
  const image = deps.baseImages[base];
  const info = await deps.images.inspect(image);
  if (!info) {
    throw new Error(
      `The base agent image ${image} is missing: build it first (docker/agent.Dockerfile)`,
    );
  }
  return info.id;
}

/** The tag a Dockerfile builds to on the base images it uses as they are now; they must exist. */
export async function dockerfileTag(
  deps: ImageDeps,
  projectId: number,
  dockerfile: string,
): Promise<string> {
  const ids = await Promise.all(dockerfileBases(dockerfile).map((base) => baseImageId(deps, base)));
  return agentImageTag(projectId, dockerfile, ids);
}

/** Builds the Dockerfile unless its tag exists already; returns the tag. */
async function buildDockerfile(
  deps: ImageDeps,
  target: { projectId: number; dockerfile: string },
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const tag = await dockerfileTag(deps, target.projectId, target.dockerfile);
  if (await deps.images.inspect(tag)) {
    onLine(`${tag} is built already: nothing changed since.`);
    return tag;
  }
  const output = deps.images.build({
    tag,
    dockerfile: buildableDockerfile(target.dockerfile, deps.baseImages),
    signal,
  });
  await drain(output, onLine, 'The build');
  return tag;
}

export async function pullImage(
  deps: ImageDeps,
  ref: string,
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  await drain(deps.images.pull(ref, signal), onLine, `Pulling ${ref}`);
}

/** Builds or pulls the saved image, then checks it; throws with what went wrong. */
export async function makeAgentImage(
  deps: ImageDeps,
  target: { projectId: number; source: OwnSource },
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<AppliedAgentImage> {
  const { source } = target;
  let tag = '';
  if (source.kind === 'dockerfile') {
    tag = await buildDockerfile(deps, { ...target, dockerfile: source.dockerfile }, onLine, signal);
  } else {
    await pullImage(deps, source.ref, onLine, signal);
    tag = source.ref;
  }
  onLine('Checking the image: the claude CLI, git, the node user and its HOME, /workspace…');
  const problem = await checkAgentImage(deps.runtime, tag, signal);
  if (problem !== null) {
    throw new Error(problem);
  }
  onLine('The image is fit for the agents.');
  const info = await deps.images.inspect(tag);
  return { ...source, tag, sizeBytes: info?.sizeBytes ?? null, appliedAt: Date.now() };
}
