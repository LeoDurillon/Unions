// `/api/union-settings`: Union's machine settings, the memory (in whole GB) and the CPU cores its containers may use.
import {
  saveUnionSettings,
  unionSettings,
  UnionSettingsError,
  type Db,
  type UnionSettings,
} from '@union/core';
import { Hono } from 'hono';

import { BAD_REQUEST, fail, readObject } from '../http';

const MB_PER_GB = 1024;

/** The settings as the page edits them: whole GB. */
export type UnionSettingsView = {
  agentMemoryGb: number;
  previewServiceMemoryGb: number;
  cpus: number;
};

function viewOf(settings: UnionSettings): UnionSettingsView {
  return {
    agentMemoryGb: Math.round(settings.agentMemoryMb / MB_PER_GB),
    previewServiceMemoryGb: Math.round(settings.previewServiceMemoryMb / MB_PER_GB),
    cpus: settings.cpus,
  };
}

export function unionSettingsRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(viewOf(unionSettings(db))));
  routes.put('/', async (c) => {
    const body = await readObject(c.req.raw);
    try {
      return c.json(viewOf(saveUnionSettings(db, body)));
    } catch (error) {
      if (error instanceof UnionSettingsError) {
        throw fail(BAD_REQUEST, error.message);
      }
      throw error;
    }
  });
  return routes;
}
