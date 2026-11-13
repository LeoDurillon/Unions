// Union's machine settings in the database: read with their defaults, saved after the checks, and what they set.

import { availableParallelism } from 'node:os';

import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import { cpusetFor, type ContainerLimits } from '../docker/container-limits';
import * as schema from '../tables';
import {
  changedSettings,
  DEFAULT_IMAGES,
  DEFAULT_UNION_SETTINGS,
  type ImageSetting,
  type UnionSettings,
} from './union-settings-fields';

/** The settings, or the defaults until they are saved. */
export function unionSettings(db: Db): UnionSettings {
  const row = db.select().from(schema.unionSettings).where(eq(schema.unionSettings.id, 1)).get();
  if (!row) {
    return DEFAULT_UNION_SETTINGS;
  }
  const { id: _id, updatedAt: _updatedAt, ...settings } = row;
  return settings;
}

/** Saves a change (see `changedSettings`); returns the result. Throws `UnionSettingsError`. */
export function saveUnionSettings(db: Db, change: Record<string, unknown>): UnionSettings {
  const next = changedSettings(unionSettings(db), change);
  db.insert(schema.unionSettings)
    .values({ id: 1, ...next, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.unionSettings.id,
      set: { ...next, updatedAt: Date.now() },
    })
    .run();
  return next;
}

/** The image the settings name, or Union's default. */
export function imageSetting(db: Db, key: ImageSetting): string {
  return unionSettings(db)[key] ?? DEFAULT_IMAGES[key];
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
