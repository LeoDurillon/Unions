// The Jira issues of a review's Description tab, for a project connected to Jira: the linked ones
// with Unlink. Also the issues the pull request names, to link in one click, and Link a Jira issue
// by key or link.

import { useState, type ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useActiveProject } from '../../lib/app/use-active-project';
import { projectIntegration } from '../../lib/integrations/integrations-api';
import {
  useReviewJiraLink,
  useReviewJiraSuggestions,
  type ReviewJiraActions,
} from '../../lib/review/use-review-jira';
import { ItemLink, TrackerLinkForm } from '../tracker/tracker-link-form';
import { Button, ErrorText } from '../ui/ui';

/** The issues the pull request names (its title, branch, description), each linked in one click. */
function Suggestions({
  review,
  actions,
}: {
  review: CurrentReview;
  actions: ReviewJiraActions;
}): ReactElement | null {
  const suggestions = useReviewJiraSuggestions(review, true);
  const found = suggestions.data ?? [];
  if (found.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1" aria-label="Jira issues the pull request names">
      {found.map((issue) => (
        <li key={issue.key} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Named in the pull request:</span>
          <ItemLink title={`${issue.key} ${issue.summary}`} url={issue.url} />
          <Button
            disabled={actions.link.isPending}
            onClick={() => {
              actions.link.mutate(issue.key);
            }}
          >
            Link
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Linked({
  review,
  actions,
}: {
  review: CurrentReview;
  actions: ReviewJiraActions;
}): ReactElement | null {
  if (review.jiraIssues.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1">
      {review.jiraIssues.map((issue) => (
        <li key={issue.id} className="flex flex-wrap items-center gap-2 text-sm">
          {issue.url ? (
            <ItemLink title={issue.title} url={issue.url} />
          ) : (
            <span>{issue.title}</span>
          )}
          <Button
            variant="ghost"
            disabled={actions.unlink.isPending}
            onClick={() => {
              actions.unlink.mutate(issue.id);
            }}
          >
            Unlink
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Each linked issue is one of the review's specs; Jira rules on posted reviews act on them. */
export function ReviewJiraLinkRow({ review }: { review: CurrentReview }): ReactElement | null {
  const { project } = useActiveProject();
  const actions = useReviewJiraLink(review);
  const [adding, setAdding] = useState(false);
  if (!project || projectIntegration(project, 'jira') === null) {
    return null;
  }
  const found = actions.check.data;
  const done = (): void => {
    setAdding(false);
    actions.check.reset();
  };
  return (
    <section className="space-y-2" aria-label="Jira issues">
      <h3 className="text-sm font-semibold">Jira issues</h3>
      <Linked review={review} actions={actions} />
      <Suggestions review={review} actions={actions} />
      <ErrorText error={actions.unlink.error ?? actions.link.error} />
      {adding ? (
        <TrackerLinkForm
          label="Jira issue key or link"
          placeholder="Link a Jira issue: its key (ABC-12) or link"
          check={actions.check}
          found={
            found
              ? { ref: found.key, title: `${found.key} ${found.summary}`, url: found.url }
              : null
          }
          linking={actions.link.isPending}
          linkError={actions.link.error}
          onLink={(key) => {
            actions.link.mutate(key, { onSuccess: done });
          }}
          onCancel={done}
        />
      ) : (
        <Button
          onClick={() => {
            setAdding(true);
          }}
        >
          Link a Jira issue
        </Button>
      )}
    </section>
  );
}
