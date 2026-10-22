// What can be done to the pull request's branch: rebase it, change its target, simplify its history.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { BranchStatus } from './branch-status';
import { ChangeTarget } from './change-target';
import { SimplifyHistory } from './simplify-history';

export function BranchActions({ detail }: { detail: TicketDetail }): ReactElement {
  return (
    <>
      <BranchStatus detail={detail} />
      <ChangeTarget detail={detail} />
      <SimplifyHistory detail={detail} />
    </>
  );
}
