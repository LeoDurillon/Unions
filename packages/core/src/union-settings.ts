// Union's machine settings: the memory its containers may use, with their defaults and the checks on a change.
import { availableParallelism } from 'node:os';

import { eq } from 'drizzle-orm';

import { cpusetFor, type ContainerLimits } from './container-limits';
import type { Db } from './db';
import * as schema from './tables';

export type UnionSettings = { agentMemoryMb: number; previewServiceMemoryMb: number; cpus: number };

const MB_PER_GB = 1024;

const DEFAULT_AGENT_GB = 4;
const DEFAULT_PREVIEW_SERVICE_GB = 2;
/** Enough for a build's workers, few enough that two runs and a preview leave the computer responsive. */
const DEFAULT_CPUS = 6;

/** 4 GB per agent container, 2 GB per preview service: two runs and a preview fit in about 12 GB. */
export const DEFAULT_UNION_SETTINGS: UnionSettings = {
  agentMemoryMb: DEFAULT_AGENT_GB * MB_PER_GB,
  previewServiceMemoryMb: DEFAULT_PREVIEW_SERVICE_GB * MB_PER_GB,
  cpus: DEFAULT_CPUS,
};

const MIN_GB = 1;
const MAX_GB = 64;
const MIN_CPUS = 1;
const MAX_CPUS = 64;

/** A change Union refuses: not a whole number of GB from 1 to 64, or of cores from 1 to 64. */
export class UnionSettingsError extends Error {}

/** The settings, or the defaults until they are saved. */
export function unionSettings(db: Db): UnionSettings {
  const row = db.select().from(schema.unionSettings).where(eq(schema.unionSettings.id, 1)).get();
  return row
    ? {
        agentMemoryMb: row.agentMemoryMb,
        previewServiceMemoryMb: row.previewServiceMemoryMb,
        cpus: row.cpus,
      }
    : DEFAULT_UNION_SETTINGS;
}

function megabytesOf(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_GB || value > MAX_GB) {
    throw new UnionSettingsError(`${what} is a whole number of GB from ${MIN_GB} to ${MAX_GB}`);
  }
  return value * MB_PER_GB;
}

function coresOf(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_CPUS ||
    value > MAX_CPUS
  ) {
    throw new UnionSettingsError(
      `CPUs per container is a whole number from ${MIN_CPUS} to ${MAX_CPUS}`,
    );
  }
  return value;
}

/** Saves a change (`agentMemoryGb`, `previewServiceMemoryGb` in GB, `cpus`; any of them); returns the result. */
export function saveUnionSettings(db: Db, change: Record<string, unknown>): UnionSettings {
  const current = unionSettings(db);
  const next: UnionSettings = {
    agentMemoryMb:
      'agentMemoryGb' in change
        ? megabytesOf(change.agentMemoryGb, 'The memory of an agent container')
        : current.agentMemoryMb,
    previewServiceMemoryMb:
      'previewServiceMemoryGb' in change
        ? megabytesOf(change.previewServiceMemoryGb, 'The memory of a preview service')
        : current.previewServiceMemoryMb,
    cpus: 'cpus' in change ? coresOf(change.cpus) : current.cpus,
  };
  db.insert(schema.unionSettings)
    .values({ id: 1, ...next, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.unionSettings.id,
      set: { ...next, updatedAt: Date.now() },
    })
    .run();
  return next;
}

/** An agent container's limits from the settings: its memory, and its cores (named by the container). */
export function agentContainerLimits(db: Db, name: string): ContainerLimits {
  const settings = unionSettings(db);
  return {
    memoryMb: settings.agentMemoryMb,
    cpuset: cpusetFor(name, settings.cpus, availableParallelism()),
  };
}

/** A preview's limits per service: its memory, and the preview's cores (named by its compose project). */
export function previewServiceLimits(db: Db, project: string): ContainerLimits {
  const settings = unionSettings(db);
  return {
    memoryMb: settings.previewServiceMemoryMb,
    cpuset: cpusetFor(project, settings.cpus, availableParallelism()),
  };
}
