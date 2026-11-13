// The ticket's Notion page: a link with Change and Unlink and, once read, its open discussions'
// count. Or Link a Notion page when it has none.

import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { projectIntegration } from '../../lib/integrations/integrations-api';
import {
  useTicketNotion,
  type TicketNotionActions,
} from '../../lib/integrations/use-ticket-notion';
import { useTrackerCommentsRead } from '../../lib/integrations/use-tracker-comments';
import { DetailRow } from '../ui/detail-row';
import { Button, ErrorText } from '../ui/ui';
import { NotionLinkForm, NotionPageLink } from './notion-link-form';

/** "· 3 open discussions", a link to the Notion tab; nothing until the tab has read them. */
function DiscussionCount({
  ticketId,
  onOpen,
}: {
  ticketId: number;
  onOpen: () => void;
}): ReactElement | null {
  const count = useTrackerCommentsRead(ticketId, 'notion')?.threads.length ?? null;
  if (count === null) {
    return null;
  }
  return (
    <button type="button" onClick={onOpen} className="text-sm text-zinc-500 hover:underline">
      · {count} open {count === 1 ? 'discussion' : 'discussions'}
    </button>
  );
}

function LinkedPage({
  url,
  actions,
  onChange,
  count,
}: {
  url: string;
  actions: TicketNotionActions;
  onChange: (() => void) | null;
  count: ReactElement;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <NotionPageLink title="Notion page" url={url} />
        {count}
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

/**
 * The page the ticket comes from or was linked to after creation; event rules write to it and it is
 * one of the ticket's specs. Hidden when the ticket has none and the project is not connected to Notion.
 */
export function TicketNotionRow({
  detail,
  onOpenComments,
}: {
  detail: TicketDetail;
  onOpenComments: () => void;
}): ReactElement | null {
  const { ticket, project } = detail;
  const actions = useTicketNotion(ticket.id);
  const [editing, setEditing] = useState(false);
  const connected = projectIntegration(project, 'notion') !== null;
  const linkedUrl = ticket.originKind === 'notion' ? ticket.originUrl : null;
  // A ticket from another tracker (Jira) cannot be linked to a page too: it has one origin.
  if (!linkedUrl && (!connected || ticket.originKind !== null)) {
    return null;
  }
  const close = (): void => {
    setEditing(false);
    actions.check.reset();
  };
  const open = (): void => {
    setEditing(true);
  };
  return (
    <DetailRow label="Notion">
      {linkedUrl && !editing ? (
        <LinkedPage
          url={linkedUrl}
          actions={actions}
          onChange={connected ? open : null}
          count={<DiscussionCount ticketId={ticket.id} onOpen={onOpenComments} />}
        />
      ) : null}
      {!linkedUrl && !editing ? <Button onClick={open}>Link a Notion page</Button> : null}
      {editing ? (
        <NotionLinkForm
          check={actions.check}
          linking={actions.link.isPending}
          linkError={actions.link.error}
          onLink={(page) => {
            actions.link.mutate(page, { onSuccess: close });
          }}
          onCancel={close}
        />
      ) : null}
    </DetailRow>
  );
}
