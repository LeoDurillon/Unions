// Brings a ticket's container up to date before a run: its attachments, its project's files, its running preview.
import type { ContainerRuntime, Db } from '@union/core';

import { syncAttachments } from './attachments-sync';
import { rejoinRunningPreview } from './preview/network';
import { syncProjectFiles } from './project-files-sync';

/** The ticket's attachments and the project's files copied in, and the container back on its preview's network. */
export async function syncTicketContainer(
  db: Db,
  runtime: ContainerRuntime,
  ticket: { id: number; projectId: number },
  names: { name: string; workspaceVolume: string },
): Promise<void> {
  await syncAttachments(db, runtime, names.name, ticket.id);
  await syncProjectFiles(db, runtime, ticket.projectId, { volume: names.workspaceVolume });
  await rejoinRunningPreview(db, runtime, ticket.id);
}
