// `/api/union-settings`: Union's machine settings: container memory (in whole GB) and cores, runs at once, images.
import {
  MB_PER_GB,
  saveUnionSettings,
  unionSettings,
  UnionSettingsError,
  type Db,
  type UnionSettings,
} from '@union/core';
import { Hono } from 'hono';

import { BAD_REQUEST, fail, readObject } from '../http';

/** The settings as the pages edit them: memory in whole GB, the rest as stored. */
export type UnionSettingsView = Omit<UnionSettings, 'agentMemoryMb' | 'previewServiceMemoryMb'> & {
  agentMemoryGb: number;
  previewServiceMemoryGb: number;
};

function viewOf({
  agentMemoryMb,
  previewServiceMemoryMb,
  ...rest
}: UnionSettings): UnionSettingsView {
  return {
    ...rest,
    agentMemoryGb: Math.round(agentMemoryMb / MB_PER_GB),
    previewServiceMemoryGb: Math.round(previewServiceMemoryMb / MB_PER_GB),
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
