// A tracker's items in a review's Description tab: the linked ones with Unlink, suggestions, Link one more.
// Only for a project connected to the tracker; an item is checked (its title shown) before it is linked.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import { useState, type ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useActiveProject } from '../../lib/app/use-active-project';
import { projectIntegration } from '../../lib/integrations/integrations-api';
import {
  useReviewTrackerLink,
  type ReviewTrackerActions,
} from '../../lib/review/use-review-tracker';
import { ItemLink, TrackerLinkForm } from '../tracker/tracker-link-form';
import { Button, ErrorText } from '../ui/ui';
import { itemTitle, LinkStackButton, TrackerSuggestions } from './review-tracker-offers';

type Props = { review: CurrentReview; kind: IntegrationKindName; actions: ReviewTrackerActions };

/** Each linked item: its title (a link to the tracker), Unlink, and the stack offer. */
function Linked({ review, kind, actions }: Props): ReactElement | null {
  const items = review.linkedItems[kind];
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
          {item.url ? <ItemLink title={item.title} url={item.url} /> : <span>{item.title}</span>}
          <Button
            variant="ghost"
            disabled={actions.unlink.isPending}
            onClick={() => {
              actions.unlink.mutate(item.id);
            }}
          >
            Unlink
          </Button>
          <LinkStackButton review={review} kind={kind} itemId={item.id} actions={actions} />
        </li>
      ))}
    </ul>
  );
}

function LinkForm({
  kind,
  actions,
  onDone,
  canCancel,
}: Omit<Props, 'review'> & {
  onDone: () => void;
  canCancel: boolean;
}): ReactElement {
  const { linkPrompt } = integrationKind(kind);
  const found = actions.check.data;
  return (
    <TrackerLinkForm
      label={linkPrompt.label}
      placeholder={linkPrompt.placeholder}
      check={actions.check}
      found={found ? { ref: found.itemId, title: itemTitle(kind, found), url: found.url } : null}
      linking={actions.link.isPending}
      linkError={actions.link.error}
      onLink={(item) => {
        actions.link.mutate({ item }, { onSuccess: onDone });
      }}
      onCancel={canCancel ? onDone : null}
    />
  );
}

/**
 * Each linked item is one of the review's specs; rules on posted reviews act on them. With none linked yet, the
 * field shows at once; else Link another.
 */
export function ReviewTrackerLinkRow({
  review,
  kind,
}: {
  review: CurrentReview;
  kind: IntegrationKindName;
}): ReactElement | null {
  const { project } = useActiveProject();
  const actions = useReviewTrackerLink(review, kind);
  const [adding, setAdding] = useState(false);
  if (!project || projectIntegration(project, kind) === null) {
    return null;
  }
  const { label, itemLabel } = integrationKind(kind);
  const some = review.linkedItems[kind].length > 0;
  const done = (): void => {
    setAdding(false);
    actions.check.reset();
  };
  return (
    <section className="space-y-2" aria-label={`${label} ${itemLabel}s`}>
      <h3 className="text-sm font-semibold">
        {label} {itemLabel}s
      </h3>
      <Linked review={review} kind={kind} actions={actions} />
      <TrackerSuggestions review={review} kind={kind} actions={actions} onDone={done} />
      <ErrorText error={actions.unlink.error ?? actions.link.error} />
      {some && !adding ? (
        <Button
          onClick={() => {
            setAdding(true);
          }}
        >
          Link another {itemLabel}
        </Button>
      ) : (
        <LinkForm kind={kind} actions={actions} onDone={done} canCancel={some} />
      )}
    </section>
  );
}
