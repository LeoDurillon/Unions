// A project's own agent image: the Dockerfile or image the user gives, checked, rewritten onto the base images, and tagged by content.

/**
 * The names a project's Dockerfile starts from: `union-agent` (the default image, with the JavaScript
 * toolchains) or `union-agent-base` (only what Union needs: git, the claude CLI, the node user).
 */
const AGENT_IMAGE_BASES = ['union-agent', 'union-agent-base'] as const;
export type AgentImageBase = (typeof AGENT_IMAGE_BASES)[number];
const MAX_DOCKERFILE_CHARS = 100_000;
const MAX_REF_CHARS = 255;
const TAG_HASH_CHARS = 16;

/** What the user chose: the base image, a Dockerfile built on it, or an image built elsewhere. */
export type AgentImageSource =
  | { kind: 'default' }
  | { kind: 'dockerfile'; dockerfile: string }
  | { kind: 'image'; ref: string };

type OwnImageSource = Exclude<AgentImageSource, { kind: 'default' }>;

/** What the project's agents run on: built (or pulled) and checked. */
export type AppliedAgentImage = OwnImageSource & {
  tag: string;
  sizeBytes: number | null;
  appliedAt: number;
};

/** A Dockerfile or image reference refused before anything is built. */
export class AgentImageError extends Error {}

const BASE_FROM =
  /^\s*FROM\s+(?<base>union-agent(?:-base)?)(?<stage>\s+AS\s+[A-Za-z0-9_.-]+)?\s*$/iu;
const IMAGE_REF = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/u;

const ANY_FROM = /^\s*FROM\s/iu;

function checkDockerfile(text: string): string {
  if (text.trim() === '') {
    throw new AgentImageError('Write the Dockerfile, or choose the default image');
  }
  if (text.length > MAX_DOCKERFILE_CHARS) {
    throw new AgentImageError(`The Dockerfile can be at most ${MAX_DOCKERFILE_CHARS} characters`);
  }
  // Earlier stages may start from anything (a toolchain to copy from); the image the agents run is the last.
  const last = text.split('\n').findLast((line) => ANY_FROM.test(line)) ?? '';
  if (!BASE_FROM.test(last)) {
    throw new AgentImageError(
      'Start the last stage with "FROM union-agent" or "FROM union-agent-base": the agents need what they have',
    );
  }
  return text.endsWith('\n') ? text : `${text}\n`;
}

function checkRef(value: string): string {
  const ref = value.trim();
  if (ref === '' || ref.length > MAX_REF_CHARS || !IMAGE_REF.test(ref)) {
    throw new AgentImageError(`"${ref}" is not an image name (registry/name:tag)`);
  }
  return ref;
}

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

/** The choice as the settings page sends it, checked. */
export function parseAgentImageSource(input: Record<string, unknown>): AgentImageSource {
  switch (input.kind) {
    case 'default': {
      return { kind: 'default' };
    }
    case 'dockerfile': {
      return { kind: 'dockerfile', dockerfile: checkDockerfile(stringField(input, 'dockerfile')) };
    }
    case 'image': {
      return { kind: 'image', ref: checkRef(stringField(input, 'ref')) };
    }
    default: {
      throw new AgentImageError('Choose the default image, a Dockerfile or an image');
    }
  }
}

function baseOf(match: RegExpExecArray): AgentImageBase {
  return match.groups?.base?.toLowerCase() === 'union-agent-base'
    ? 'union-agent-base'
    : 'union-agent';
}

/** The bases the Dockerfile starts stages from, each once, in order. */
export function dockerfileBases(text: string): AgentImageBase[] {
  const found = text.split('\n').flatMap((line) => {
    const match = BASE_FROM.exec(line);
    return match ? [baseOf(match)] : [];
  });
  return [...new Set(found)];
}

/** The Dockerfile as built: every `FROM union-agent[-base]` starts from that image as the worker has it. */
export function buildableDockerfile(
  text: string,
  images: Readonly<Record<AgentImageBase, string>>,
): string {
  return text
    .split('\n')
    .map((line) => {
      const match = BASE_FROM.exec(line);
      return match ? `FROM ${images[baseOf(match)]}${match.groups?.stage ?? ''}` : line;
    })
    .join('\n');
}

/** The repository a project's built images are tagged in. */
export function agentImageRepository(projectId: number): string {
  return `union-agent-p${projectId}`;
}

/**
 * The tag of the Dockerfile built on these base images (the ids of the ones it uses, in order): a change
 * to the Dockerfile or to one of them is a new tag.
 */
export function agentImageTag(
  projectId: number,
  dockerfile: string,
  baseImageIds: readonly string[],
): string {
  const hash = new Bun.CryptoHasher('sha256')
    .update(`${baseImageIds.join('\n')}\n${dockerfile}`)
    .digest('hex');
  return `${agentImageRepository(projectId)}:${hash.slice(0, TAG_HASH_CHARS)}`;
}
