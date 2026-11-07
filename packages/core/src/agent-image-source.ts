// A project's own agent image: the Dockerfile or image the user gives, checked, rewritten onto the base image, and tagged by content.

/** The name a project's Dockerfile starts from (`FROM union-agent`): the base agent image. */
const AGENT_IMAGE_BASE_NAME = 'union-agent';
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

const BASE_FROM = /^\s*FROM\s+union-agent(?<stage>\s+AS\s+[A-Za-z0-9_.-]+)?\s*$/iu;
const IMAGE_REF = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/u;

function isInstruction(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== '' && !trimmed.startsWith('#');
}

function checkDockerfile(text: string): string {
  if (text.trim() === '') {
    throw new AgentImageError('Write the Dockerfile, or choose the default image');
  }
  if (text.length > MAX_DOCKERFILE_CHARS) {
    throw new AgentImageError(`The Dockerfile can be at most ${MAX_DOCKERFILE_CHARS} characters`);
  }
  const first = text.split('\n').find((line) => isInstruction(line)) ?? '';
  if (!BASE_FROM.test(first)) {
    throw new AgentImageError(
      `Start the Dockerfile with "FROM ${AGENT_IMAGE_BASE_NAME}": the agents need what the base image has`,
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

/** The Dockerfile as built: every `FROM union-agent` starts from the base image the worker has. */
export function buildableDockerfile(text: string, baseImage: string): string {
  return text
    .split('\n')
    .map((line) => {
      const match = BASE_FROM.exec(line);
      return match ? `FROM ${baseImage}${match.groups?.stage ?? ''}` : line;
    })
    .join('\n');
}

/** The repository a project's built images are tagged in. */
export function agentImageRepository(projectId: number): string {
  return `union-agent-p${projectId}`;
}

/** The tag of the Dockerfile built on this base image: a change to either is a new tag. */
export function agentImageTag(projectId: number, dockerfile: string, baseImageId: string): string {
  const hash = new Bun.CryptoHasher('sha256').update(`${baseImageId}\n${dockerfile}`).digest('hex');
  return `${agentImageRepository(projectId)}:${hash.slice(0, TAG_HASH_CHARS)}`;
}
