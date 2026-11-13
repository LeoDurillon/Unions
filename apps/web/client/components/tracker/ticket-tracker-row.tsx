// The ticket's item of one tracker in its Overview: a link with Change and Unlink and, once read, its comments'
// count. Or Link a page / an issue, for a ticket from no tracker in a project connected to it.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { projectIntegration } from '../../lib/integrations/integrations-api';
import {
  useTicketTrackerLink,
  type TicketTrackerLinkActions,
} from '../../lib/integrations/use-ticket-tracker-link';
import { useTrackerCommentsRead } from '../../lib/integrations/use-tracker-comments';
import { DetailRow } from '../ui/detail-row';
import { Button, ErrorText } from '../ui/ui';
import { ItemLink, TrackerLinkForm } from './tracker-link-form';

/** "· 3 comments", a link to the tab; nothing until the tab has read them (the tracker is not called from here). */
function CommentCount({
  ticketId,
  kind,
  onOpen,
}: {
  ticketId: number;
  kind: IntegrationKindName;
  onOpen: () => void;
}): ReactElement | null {
  const data = useTrackerCommentsRead(ticketId, kind);
  if (!data) {
    return null;
  }
  const { counts, one, many } = integrationKind(kind).commentCount;
  const count = counts === 'threads' ? data.threads.length : data.total;
  return (
    <button type="button" onClick={onOpen} className="text-sm text-zinc-500 hover:underline">
      · {count} {count === 1 ? one : many}
    </button>
  );
}

function LinkedItemRow({
  detail,
  kind,
  actions,
  onChange,
  onOpenComments,
}: {
  detail: TicketDetail;
  kind: IntegrationKindName;
  actions: TicketTrackerLinkActions;
  onChange: (() => void) | null;
  onOpenComments: () => void;
}): ReactElement {
  const { ticket } = detail;
  const { label, itemLabel, namedByKey } = integrationKind(kind);
  const title = namedByKey ? (ticket.originId ?? '') : `${label} ${itemLabel}`;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {ticket.originUrl ? (
          <ItemLink title={title} url={ticket.originUrl} />
        ) : (
          <span className="font-medium">{title}</span>
        )}
        <CommentCount ticketId={ticket.id} kind={kind} onOpen={onOpenComments} />
        {onChange ? (
          <Button variant="ghost" onClick={onChange}>
            Change
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={actions.unlink.isPending}
          onClick={() => {
            actions.unlink.mutate();
          }}
        >
          Unlink
        </Button>
      </div>
      <ErrorText error={actions.unlink.error} />
    </div>
  );
}

/** The item's key or link, checked (its title shown) before it is linked. */
function LinkForm({
  kind,
  actions,
  onDone,
}: {
  kind: IntegrationKindName;
  actions: TicketTrackerLinkActions;
  onDone: () => void;
}): ReactElement {
  const { linkPrompt, namedByKey } = integrationKind(kind);
  const found = actions.check.data;
  return (
    <TrackerLinkForm
      label={linkPrompt.label}
      placeholder={linkPrompt.placeholder}
      check={actions.check}
      found={
        found
          ? {
              ref: found.itemId,
              title: namedByKey ? `${found.itemId} ${found.title}` : found.title,
              url: found.url,
            }
          : null
      }
      linking={actions.link.isPending}
      linkError={actions.link.error}
      onLink={(ref) => {
        actions.link.mutate(ref, { onSuccess: onDone });
      }}
      onCancel={onDone}
    />
  );
}

/**
 * The item the ticket comes from or was linked to after creation: rules act on it and its tab reads its
 * comments. Hidden for a ticket from another tracker, and when there is no item and no connection.
 */
export function TicketTrackerRow({
  detail,
  kind,
  onOpenComments,
}: {
  detail: TicketDetail;
  kind: IntegrationKindName;
  onOpenComments: () => void;
}): ReactElement | null {
  const { ticket, project } = detail;
  const actions = useTicketTrackerLink(ticket.id, kind);
  const [editing, setEditing] = useState(false);
  const connected = projectIntegration(project, kind) !== null;
  const linked = ticket.originKind === kind && ticket.originId !== null;
  // A ticket from another tracker cannot be linked to this one's item too: it has one origin.
  if (!linked && (!connected || ticket.originKind !== null)) {
    return null;
  }
  const { label, itemLabel } = integrationKind(kind);
  const close = (): void => {
    setEditing(false);
    actions.check.reset();
  };
  const open = (): void => {
    setEditing(true);
  };
  return (
    <DetailRow label={label}>
      {linked && !editing ? (
        <LinkedItemRow
          detail={detail}
          kind={kind}
          actions={actions}
          onChange={connected ? open : null}
          onOpenComments={onOpenComments}
        />
      ) : null}
      {!linked && !editing ? (
        <Button onClick={open}>
          Link a {label} {itemLabel}
        </Button>
      ) : null}
      {editing ? <LinkForm kind={kind} actions={actions} onDone={close} /> : null}
    </DetailRow>
  );
}
