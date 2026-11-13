// The ticket's Jira issue in its Overview: the key linking to the issue, its comments' count once
// read, Change and Unlink. Or Link a Jira issue, for a ticket from no tracker in a project
// connected to Jira.

import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { projectIntegration } from '../../lib/integrations/integrations-api';
import { useTicketJira, type TicketJiraActions } from '../../lib/integrations/use-ticket-jira';
import { useTrackerCommentsRead } from '../../lib/integrations/use-tracker-comments';
import { DetailRow } from '../ui/detail-row';
import { Button, ErrorText } from '../ui/ui';
import { ItemLink, TrackerLinkForm } from './tracker-link-form';

/** "· 3 comments", a link to the Jira tab; nothing until the tab has read them (Jira is not called from here). */
function CommentCount({
  ticketId,
  onOpen,
}: {
  ticketId: number;
  onOpen: () => void;
}): ReactElement | null {
  const data = useTrackerCommentsRead(ticketId, 'jira');
  if (!data) {
    return null;
  }
  return (
    <button type="button" onClick={onOpen} className="text-sm text-zinc-500 hover:underline">
      · {data.total} {data.total === 1 ? 'comment' : 'comments'}
    </button>
  );
}

function LinkedIssue({
  detail,
  actions,
  onChange,
  onOpenComments,
}: {
  detail: TicketDetail;
  actions: TicketJiraActions;
  onChange: (() => void) | null;
  onOpenComments: () => void;
}): ReactElement {
  const { ticket } = detail;
  const key = ticket.originId ?? '';
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {ticket.originUrl ? (
          <ItemLink title={key} url={ticket.originUrl} />
        ) : (
          <span className="font-medium">{key}</span>
        )}
        <CommentCount ticketId={ticket.id} onOpen={onOpenComments} />
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

/** The issue's key or link, checked (its summary shown) before it is linked. */
function JiraLinkForm({
  actions,
  onDone,
}: {
  actions: TicketJiraActions;
  onDone: () => void;
}): ReactElement {
  const found = actions.check.data;
  return (
    <TrackerLinkForm
      label="Jira issue key or link"
      placeholder="Link a Jira issue: its key (ABC-12) or link"
      check={actions.check}
      found={
        found ? { ref: found.key, title: `${found.key} ${found.title}`, url: found.url } : null
      }
      linking={actions.link.isPending}
      linkError={actions.link.error}
      onLink={(key) => {
        actions.link.mutate(key, { onSuccess: onDone });
      }}
      onCancel={onDone}
    />
  );
}

/**
 * The issue the ticket comes from or was linked to after creation: Jira rules act on it and its tab reads
 * its comments. Hidden for a ticket from another tracker, and when there is no issue and no Jira project.
 */
export function TicketJiraRow({
  detail,
  onOpenComments,
}: {
  detail: TicketDetail;
  onOpenComments: () => void;
}): ReactElement | null {
  const { ticket, project } = detail;
  const actions = useTicketJira(ticket.id);
  const [editing, setEditing] = useState(false);
  const connected = projectIntegration(project, 'jira') !== null;
  const linked = ticket.originKind === 'jira' && ticket.originId !== null;
  if (!linked && (!connected || ticket.originKind !== null)) {
    return null;
  }
  const close = (): void => {
    setEditing(false);
    actions.check.reset();
  };
  return (
    <DetailRow label="Jira">
      {linked && !editing ? (
        <LinkedIssue
          detail={detail}
          actions={actions}
          onChange={
            connected
              ? () => {
                  setEditing(true);
                }
              : null
          }
          onOpenComments={onOpenComments}
        />
      ) : null}
      {!linked && !editing ? (
        <Button
          onClick={() => {
            setEditing(true);
          }}
        >
          Link a Jira issue
        </Button>
      ) : null}
      {editing ? <JiraLinkForm actions={actions} onDone={close} /> : null}
    </DetailRow>
  );
}
