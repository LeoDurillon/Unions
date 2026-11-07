// Makes a project's agent image from what the user saved: the Dockerfile built on the base image, or the image pulled, then checked.
import {
  agentImageTag,
  buildableDockerfile,
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
  /** The base agent image the Dockerfiles start from (`union-agent:local`). */
  baseImage: string;
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

/** The tag a Dockerfile builds to on the current base image; the base must exist. */
export async function dockerfileTag(
  deps: ImageDeps,
  projectId: number,
  dockerfile: string,
): Promise<string> {
  const base = await deps.images.inspect(deps.baseImage);
  if (!base) {
    throw new Error(
      `The base agent image ${deps.baseImage} is missing: build it first (docker/agent.Dockerfile)`,
    );
  }
  return agentImageTag(projectId, dockerfile, base.id);
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
    dockerfile: buildableDockerfile(target.dockerfile, deps.baseImage),
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
