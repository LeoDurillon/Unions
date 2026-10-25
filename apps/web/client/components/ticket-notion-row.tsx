// The ticket's Notion page: a link with Change and Unlink, or Link a Notion page when it has none.
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { projectIntegration } from '../lib/integrations-api';
import { useTicketNotion, type TicketNotionActions } from '../lib/use-ticket-notion';
import { DetailRow } from './detail-row';
import { NotionLinkForm, NotionPageLink } from './notion-link-form';
import { Button, ErrorText } from './ui';

function LinkedPage({
  url,
  actions,
  onChange,
}: {
  url: string;
  actions: TicketNotionActions;
  onChange: (() => void) | null;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <NotionPageLink title="Notion page" url={url} />
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
export function TicketNotionRow({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket, project } = detail;
  const actions = useTicketNotion(ticket.id);
  const [editing, setEditing] = useState(false);
  const connected = projectIntegration(project, 'notion') !== null;
  const linkedUrl = ticket.originKind === 'notion' ? ticket.originUrl : null;
  if (!linkedUrl && !connected) {
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
        <LinkedPage url={linkedUrl} actions={actions} onChange={connected ? open : null} />
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
