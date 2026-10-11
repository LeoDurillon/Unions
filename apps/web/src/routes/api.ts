import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import type { NotionApi } from '../notion';
import { agentRoutes } from './agents';
import { eventRoutes } from './events';
import { githubRoutes } from './github';
import { notionRoutes } from './notion';
import { projectRoutes } from './projects';
import { ticketRoutes } from './tickets';

/** Every `/api` route, with the outside services they may call. */
export function apiRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  const api = new Hono();
  api.get('/health', (c) => c.json({ ok: true }));
  api.route('/agents', agentRoutes(db));
  api.route('/projects', projectRoutes(db));
  api.route('/github', githubRoutes(github));
  api.route('/notion', notionRoutes(db, notion));
  api.route('/tickets', ticketRoutes(db, github));
  api.route('/events', eventRoutes(db));
  return api;
}
