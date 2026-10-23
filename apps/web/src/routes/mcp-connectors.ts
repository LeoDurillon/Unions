// `/api/agents/connectors`: the account's claude.ai connectors as the last check read them, and
// `POST /check` to read them again (the worker does, in a throwaway container).
import {
  latestConnectorCheck,
  listConnectors,
  queueConnectorCheck,
  connectorTool,
  type Db,
} from '@union/core';
import { Hono } from 'hono';

import type { ConnectorsResponse } from '../api-types';
import { ACCEPTED } from '../http';

function connectorsOf(db: Db): ConnectorsResponse {
  const check = latestConnectorCheck(db);
  return {
    connectors: listConnectors(db).map((connector) =>
      Object.assign(connector, { tool: connectorTool(connector.name) }),
    ),
    check: check && {
      status: check.status,
      error: check.error,
      createdAt: check.createdAt,
      finishedAt: check.finishedAt,
    },
  };
}

/**
 * `/api/agents/connectors`: the account's claude.ai connectors as the last check read them, and
 * `POST /check` to read them again (the worker does, in a throwaway container).
 */
export function connectorRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(connectorsOf(db)));
  routes.post('/check', (c) => {
    queueConnectorCheck(db);
    return c.json(connectorsOf(db), ACCEPTED);
  });
  return routes;
}
