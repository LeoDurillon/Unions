// The rarer branch operations of an open pull request, folded under "More actions": change target,
// simplify history, split into a stack.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { ChangeTarget } from './change-target';
import { SimplifyHistory } from './simplify-history';
import { SplitStack } from './split-stack';

/** Shown while the pull request is open and not a stack (a stack's actions are in its panel). */
export function MoreActions({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket } = detail;
  if (ticket.branch === null || ticket.prState !== 'open' || ticket.stack) {
    return null;
  }
  return (
    <details className="group rounded-md border border-zinc-200 text-sm dark:border-zinc-800">
      <summary className="cursor-pointer px-3 py-2 text-zinc-600 select-none hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        More actions{' '}
        <span className="text-xs text-zinc-500">
          change target, simplify history
          {detail.project.config.stacks === true ? ', split into a stack' : ''}
        </span>
      </summary>
      <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <ChangeTarget detail={detail} />
        <SimplifyHistory detail={detail} />
        <SplitStack detail={detail} />
      </div>
    </details>
  );
}
