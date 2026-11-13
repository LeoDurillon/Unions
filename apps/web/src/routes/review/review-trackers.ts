// The routes of a pull request under review about the trackers' items it implements: Notion pages, Jira issues.
// Their text, links and suggestions, and their properties set by hand.

import type { Db, JiraApi, NotionApi } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../../github-onboarding';
import { load } from '../pull-requests/pr-review-load';
import { reviewJiraRoutes } from './review-jira';
import { reviewNotionRoutes } from './review-notion';
import { notionSuggestions } from './review-notion-suggestions';
import { reviewTrackerFieldRoutes } from './review-tracker-fields';

/** Under the review: `/notion` and its suggestions, `/jira` (its suggestions within), `/tracker-fields`. */
export function reviewTrackerRoutes(
  db: Db,
  { github, notion, jira }: { github: OnboardingGitHub; notion: NotionApi; jira: JiraApi },
): Hono {
  const routes = new Hono();
  routes.get('/notion/suggestions', (c) =>
    notionSuggestions(c, { db, github, notion }, load(db, c)),
  );
  routes.route('/notion', reviewNotionRoutes(db, notion));
  routes.route('/jira', reviewJiraRoutes(db, { github, jira }));
  routes.route('/', reviewTrackerFieldRoutes(db, { notion, jira }));
  return routes;
}
