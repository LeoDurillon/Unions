// A preview's output in its ticket's log, a batch of lines per event; a pull request's preview has none.
import { emitEvent, ticketOwnerId, type Db, type WorkspaceOwner } from '@union/core';

/** Output lines per `preview_output` event: a build prints thousands. */
const OUTPUT_BATCH = 25;

/** Sends the output to the ticket's log a batch at a time; a pull request's preview has no log. */
export function outputLog(
  db: Db,
  owner: WorkspaceOwner,
): { push: (line: string) => void; flush: () => void } {
  const ticketId = ticketOwnerId(owner);
  let lines: string[] = [];
  const flush = (): void => {
    if (ticketId !== null && lines.length > 0) {
      emitEvent(db, { type: 'preview_output', ticketId, payload: { lines } });
      lines = [];
    }
  };
  return {
    push: (line) => {
      if (ticketId === null) {
        return;
      }
      lines.push(line);
      if (lines.length >= OUTPUT_BATCH) {
        flush();
      }
    },
    flush,
  };
}
