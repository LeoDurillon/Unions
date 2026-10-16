// Creates a ticket drafted from an investigation as a page of the project's Notion data source too.
import type { DraftedTicket, Investigation, NotionApi, Project, TicketDraft } from '@union/core';

/**
 * The draft with its new Notion page, when the user asked for one. A failure there does not lose
 * the draft: the ticket is still created, and the investigation says why Notion has no page.
 */
export async function withNotionPage(
  notion: NotionApi,
  project: Project,
  investigation: Investigation,
  draft: TicketDraft,
): Promise<DraftedTicket> {
  if (!investigation.ticketInNotion) {
    return { draft };
  }
  const dataSourceId = project.config.notionDataSourceId;
  if (!project.notionToken || !dataSourceId) {
    return { draft, notionError: 'The project is not connected to a Notion data source' };
  }
  try {
    const page = await notion.createPage(project.notionToken, dataSourceId, {
      title: draft.title,
      markdown: draft.body,
    });
    return { draft, notionPageId: page.id };
  } catch (error) {
    return { draft, notionError: error instanceof Error ? error.message : String(error) };
  }
}
