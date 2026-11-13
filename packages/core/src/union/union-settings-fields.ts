// Union's machine settings without the database: their shape, defaults and bounds, and the checks on a change.

export type UnionSettings = {
  agentMemoryMb: number;
  previewServiceMemoryMb: number;
  cpus: number;
  maxConcurrentRuns: number;
  maxPreviews: number;
  githubPullSeconds: number;
  maxProjectFileMb: number;
  /** null: Union's default (`DEFAULT_IMAGES`). */
  agentImage: string | null;
  agentBaseImage: string | null;
  composeImage: string | null;
};

export const MB_PER_GB = 1024;

/**
 * The images Union runs when the settings name none. The compose helper is pinned by digest: it
 * holds the Docker socket, and a tag could be taken over locally by a build.
 */
export const DEFAULT_IMAGES = {
  agentImage: 'union-agent:local',
  agentBaseImage: 'union-agent-base:local',
  composeImage:
    'docker:29.0.0-cli@sha256:87858a6dd14149240f4a2c33e0ec0f32a5ac1bb2548c04f5a20694ea25cb6157',
} as const;

export type ImageSetting = keyof typeof DEFAULT_IMAGES;

const IMAGE_SETTINGS: readonly ImageSetting[] = ['agentImage', 'agentBaseImage', 'composeImage'];

type Bounds = { min: number; max: number };

/** The whole numbers a change gives as they are stored, with their bounds. */
export const COUNT_BOUNDS = {
  cpus: { min: 1, max: 64 },
  maxConcurrentRuns: { min: 1, max: 16 },
  maxPreviews: { min: 1, max: 20 },
  githubPullSeconds: { min: 10, max: 3600 },
  maxProjectFileMb: { min: 1, max: 10_240 },
} as const satisfies Record<string, Bounds>;

type CountSetting = keyof typeof COUNT_BOUNDS;

const COUNT_NAMES: Record<CountSetting, string> = {
  cpus: 'CPUs per container',
  maxConcurrentRuns: 'Agent runs at once',
  maxPreviews: 'Previews at once',
  githubPullSeconds: 'The GitHub pull interval (in seconds)',
  maxProjectFileMb: 'The largest project file (in MB)',
};

const COUNT_SETTINGS: readonly CountSetting[] = [
  'cpus',
  'maxConcurrentRuns',
  'maxPreviews',
  'githubPullSeconds',
  'maxProjectFileMb',
];

/** The memory a change gives in whole GB, from 1 to 64. */
export const GB_BOUNDS: Bounds = { min: 1, max: 64 };

const GB_SETTINGS = [
  { input: 'agentMemoryGb', key: 'agentMemoryMb', name: 'The memory of an agent container' },
  {
    input: 'previewServiceMemoryGb',
    key: 'previewServiceMemoryMb',
    name: 'The memory of a preview service',
  },
] as const;

/** Two runs at once, three previews, GitHub read every 30 s, project files up to 2 GB. */
export const DEFAULT_COUNTS = {
  maxConcurrentRuns: 2,
  maxPreviews: 3,
  githubPullSeconds: 30,
  maxProjectFileMb: 2048,
} as const;

const DEFAULT_AGENT_GB = 4;
const DEFAULT_PREVIEW_SERVICE_GB = 2;
/** Enough for a build's workers, few enough that two runs and a preview leave the computer responsive. */
const DEFAULT_CPUS = 6;

/** 4 GB per agent container, 2 GB per preview service: two runs and a preview fit in about 12 GB. */
export const DEFAULT_UNION_SETTINGS: UnionSettings = {
  agentMemoryMb: DEFAULT_AGENT_GB * MB_PER_GB,
  previewServiceMemoryMb: DEFAULT_PREVIEW_SERVICE_GB * MB_PER_GB,
  cpus: DEFAULT_CPUS,
  ...DEFAULT_COUNTS,
  agentImage: null,
  agentBaseImage: null,
  composeImage: null,
};

const MAX_IMAGE_LENGTH = 255;
/** A Docker image reference: `[registry/]name[:tag][@digest]`, nothing a shell or flag could read. */
const IMAGE_REFERENCE = /^[a-z0-9][\w.\-/]*(?::[\w.-]+)?(?:@sha256:[a-f0-9]{64})?$/u;

/** A change Union refuses: a number out of its bounds, or a name that is not an image's. */
export class UnionSettingsError extends Error {}

function wholeNumber(value: unknown, bounds: Bounds, name: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < bounds.min ||
    value > bounds.max
  ) {
    throw new UnionSettingsError(`${name} is a whole number from ${bounds.min} to ${bounds.max}`);
  }
  return value;
}

/** An image name, or null for the default (an empty or missing name). */
function imageOf(value: unknown, key: ImageSetting): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const name = typeof value === 'string' ? value.trim() : '';
  if (typeof value === 'string' && name === '') {
    return null;
  }
  if (name.length > MAX_IMAGE_LENGTH || !IMAGE_REFERENCE.test(name)) {
    throw new UnionSettingsError(
      `${typeof value === 'string' ? value : typeof value} is not an image name (like ${DEFAULT_IMAGES[key]})`,
    );
  }
  return name;
}

/**
 * The settings after a change: memory in whole GB (`agentMemoryGb`, `previewServiceMemoryGb`), the
 * other numbers and the images as stored; any of them, the others kept.
 */
export function changedSettings(
  current: UnionSettings,
  change: Record<string, unknown>,
): UnionSettings {
  const next = { ...current };
  for (const field of GB_SETTINGS) {
    if (field.input in change) {
      next[field.key] = wholeNumber(change[field.input], GB_BOUNDS, field.name) * MB_PER_GB;
    }
  }
  for (const key of COUNT_SETTINGS) {
    if (key in change) {
      next[key] = wholeNumber(change[key], COUNT_BOUNDS[key], COUNT_NAMES[key]);
    }
  }
  for (const key of IMAGE_SETTINGS) {
    if (key in change) {
      next[key] = imageOf(change[key], key);
    }
  }
  return next;
}
