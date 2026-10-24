// What the ticket panel says about the tracker item a ticket was imported from (a Notion page).
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';

/** "Notion page"; null for a ticket written in Union or imported from a GitHub issue. */
export function originName(kind: IntegrationKindName | null): string | null {
  if (kind === null) {
    return null;
  }
  const { label, itemLabel } = integrationKind(kind);
  return `${label} ${itemLabel}`;
}

/** The description as shown: an import's own markup cleaned (older imports kept it). */
export function shownBody(ticket: {
  originKind: IntegrationKindName | null;
  body: string;
}): string {
  return ticket.originKind === null
    ? ticket.body
    : integrationKind(ticket.originKind).cleanMarkdown(ticket.body);
}
