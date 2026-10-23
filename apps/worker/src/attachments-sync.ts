// Puts the ticket's current files in the container, before every step: files added since the last
// step appear, removed ones disappear, and whatever the agent changed in them is reset.
import {
  CONTAINER_ATTACHMENTS_DIR,
  listAttachments,
  ticketAttachmentsDir,
  type ContainerRuntime,
  type Db,
} from '@union/core';

import { mustRunIn } from './container-exec';

/**
 * Puts the ticket's current files in the container, before every step: files added since the last
 * step appear, removed ones disappear, and whatever the agent changed in them is reset.
 */
export async function syncAttachments(
  db: Db,
  runtime: ContainerRuntime,
  container: string,
  ticketId: number,
): Promise<void> {
  await mustRunIn(runtime, container, ['rm', '-rf', CONTAINER_ATTACHMENTS_DIR]);
  if (listAttachments(db, ticketId).length > 0) {
    await runtime.copyIn(container, ticketAttachmentsDir(ticketId), CONTAINER_ATTACHMENTS_DIR);
  }
}
