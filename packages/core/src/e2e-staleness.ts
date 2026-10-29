// Whether a preview's last e2e result still describes it: the preview restarted or the code changed since.
import type { Preview } from './previews';

/**
 * Why the last finished e2e result may not describe the preview now (null: it does, or there is
 * none). `codeChangedAt`: when the workspace's code last changed (an agent run started), if known.
 */
export function e2eStaleness(
  preview: Pick<Preview, 'e2eStatus' | 'e2eAt' | 'startedAt'>,
  codeChangedAt: number | null,
): string | null {
  const { e2eStatus, e2eAt, startedAt } = preview;
  if (e2eStatus === null || e2eStatus === 'running' || e2eAt === null) {
    return null;
  }
  if (codeChangedAt !== null && codeChangedAt > e2eAt) {
    return 'The agent worked on the ticket since these tests ran: run them again.';
  }
  if (startedAt !== null && startedAt > e2eAt) {
    return 'The preview restarted since these tests ran: run them again.';
  }
  return null;
}
