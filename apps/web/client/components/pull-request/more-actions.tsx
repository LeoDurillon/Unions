// The branch operations of an open pull request, opened from the branch card's menu button. Change target,
// simplify history, split into a stack.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { ChangeTarget } from './change-target';
import { SimplifyHistory } from './simplify-history';
import { SplitStack } from './split-stack';

/** While the pull request is open and not a stack (a stack's actions are in its panel). */
export function hasMoreActions(detail: TicketDetail): boolean {
  const { ticket } = detail;
  return ticket.branch !== null && ticket.prState === 'open' && !ticket.stack;
}

/** The menu button's words: what it opens. */
export function moreActionsLabel(detail: TicketDetail): string {
  return detail.project.config.stacks === true
    ? 'Change target, simplify, split'
    : 'Change target, simplify';
}

export function MoreActions({ detail }: { detail: TicketDetail }): ReactElement {
  return (
    <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <ChangeTarget detail={detail} />
      <SimplifyHistory detail={detail} />
      <SplitStack detail={detail} />
    </div>
  );
}
