// Creates a ticket drafted from an investigation as an item of the tracker the user picked too (a Notion page).
import {
  integrationKind,
  integrationOf,
  notionProvider,
  type Db,
  type DraftedTicket,
  type IntegrationKindName,
  type IntegrationProvider,
  type Investigation,
  type NotionApi,
  type TicketDraft,
} from '@union/core';

const PROVIDERS: Record<IntegrationKindName, (notion: NotionApi) => IntegrationProvider> = {
  notion: notionProvider,
};

/**
 * The draft with its new item in the target tracker, when the user asked for one. A failure there
 * does not lose the draft: the ticket is still created, and the investigation says why.
 */
export async function withTargetItem(
  db: Db,
  notion: NotionApi,
  investigation: Investigation,
  draft: TicketDraft,
): Promise<DraftedTicket> {
  const kind = investigation.ticketTarget;
  if (kind === null) {
    return { draft };
  }
  const integration = integrationOf(db, investigation.projectId, kind);
  const provider = PROVIDERS[kind](notion);
  if (!integration || !provider.createItem) {
    return {
      draft,
      originError: `The project is not connected to ${integrationKind(kind).label}`,
    };
  }
  try {
    const item = await provider.createItem(integration.secret, integration.config, {
      title: draft.title,
      markdown: draft.body,
    });
    return { draft, origin: { kind, id: item.id, url: item.url } };
  } catch (error) {
    return { draft, originError: error instanceof Error ? error.message : String(error) };
  }
}
