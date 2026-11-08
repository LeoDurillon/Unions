// The ticket workspace's own commands: resyncing its branch from GitHub, showing an imported pull request.

import type { CommandHooks } from './command-hooks';
import { showAdoptedPullRequest } from './pull-request/pr-adopt';
import { resyncBranch, type ResyncDeps } from './rebase/resync-branch';

/** The ticket workspace's own commands: resyncing its branch from GitHub, showing an imported PR. */
export function workspaceHooks(
  deps: ResyncDeps,
): Pick<CommandHooks, 'resyncBranch' | 'showAdoptedPullRequest'> {
  return {
    resyncBranch: (ticketId) => {
      void resyncBranch(deps, ticketId);
    },
    showAdoptedPullRequest: (ticketId) => {
      void showAdoptedPullRequest(deps, ticketId);
    },
  };
}
