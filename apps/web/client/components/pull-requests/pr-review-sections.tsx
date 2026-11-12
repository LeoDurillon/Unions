// The tabs a pull request review shows before its diff: Notion and Jira once it is linked, then the
// spec report. The review agents come last.

import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review/review-target';
import { ReportTab } from '../review/report-tab';
import { ReviewAgentsTab } from '../review/review-agents-tab';
import type { ReviewSection } from '../review/review-page';
import { ReviewCommentsTab } from './review-comments-tab';
import { ReviewDescription } from './review-description';
import { ReviewJiraTab } from './review-jira-tab';
import { ReviewNotionTab } from './review-notion-tab';

/** A tracker's tab once the review is linked to one of its items or more: "Notion", "Notion (2)". */
function trackerTab(
  id: string,
  name: string,
  count: number,
  content: ReactElement,
): ReviewSection[] {
  if (count === 0) {
    return [];
  }
  return [{ id, label: count > 1 ? `${name} (${count})` : name, content }];
}

/** The tabs a pull request review shows before its diff; Notion and Jira once linked. */
export function prReviewSections(target: ReviewTarget, review: CurrentReview): ReviewSection[] {
  const notion = trackerTab(
    'notion',
    'Notion',
    review.notionPages.length,
    <ReviewNotionTab review={review} />,
  );
  const jira = trackerTab(
    'jira',
    'Jira',
    review.jiraIssues.length,
    <ReviewJiraTab review={review} />,
  );
  return [
    {
      id: 'description',
      label: 'Description',
      content: <ReviewDescription target={target} review={review} />,
    },
    ...notion,
    ...jira,
    {
      id: 'comments',
      label: 'Comments',
      content: <ReviewCommentsTab target={target} number={review.prNumber} />,
    },
    {
      id: 'report',
      label: 'Report',
      content: ({ openDiff }) => <ReportTab target={target} openDiff={openDiff} />,
    },
    {
      id: 'agents',
      label: 'Agents',
      content: ({ openDiff }) => <ReviewAgentsTab target={target} openDiff={openDiff} />,
    },
  ];
}
