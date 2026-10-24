// Where the pull request's branch stands against its base, and rebasing it.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { BranchStatus } from './branch-status';
import { FollowedBase } from './followed-base';

export function BranchActions({ detail }: { detail: TicketDetail }): ReactElement {
  return (
    <>
      <FollowedBase detail={detail} />
      <BranchStatus detail={detail} />
    </>
  );
}
