// `<review>/notion/suggestions`: the Notion pages the pull request's description links to, offered for linking.
import { integrationOf, notionUrlsIn, type Db, type NotionApi } from '@union/core';
import type { Context } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import type { ReviewNotionLink } from '../review-notion-types';
import { guarded } from './github-errors';
import { authOf, type Project, type Review } from './pr-review-load';

/** A description rarely names more; each one is a Notion read. */
const MAX_SUGGESTIONS = 5;

/** Readable pages only (one not shared with the integration is left out), never the linked one. */
export async function notionSuggestions(
  c: Context,
  services: { db: Db; github: OnboardingGitHub; notion: NotionApi },
  target: { review: Review; project: Project },
): Promise<Response> {
  const { review, project } = target;
  const token = integrationOf(services.db, project.id, 'notion')?.secret;
  if (!token) {
    return c.json([]);
  }
  const repo = { owner: project.owner, repo: project.repo };
  const discussion = await guarded(() =>
    services.github.getDiscussion(authOf(services.db, project), repo, review.prNumber),
  );
  const links = notionUrlsIn(discussion?.description ?? '')
    .filter((link) => link.id !== review.notionPageId)
    .slice(0, MAX_SUGGESTIONS);
  const pages = await Promise.all(
    links.map((link) =>
      services.notion.page(token, link.id).then(
        (page): ReviewNotionLink[] => [
          { pageId: page.id, title: page.title || 'Untitled Notion page', url: page.url },
        ],
        (): ReviewNotionLink[] => [],
      ),
    ),
  );
  return c.json(pages.flat());
}
