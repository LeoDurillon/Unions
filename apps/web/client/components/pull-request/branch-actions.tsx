// Where the pull request's branch stands against its base and against GitHub, and rebasing or resyncing it.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { BranchMoved } from './branch-moved';
import { BranchStatus } from './branch-status';
import { FollowedBase } from './followed-base';

export function BranchActions({ detail }: { detail: TicketDetail }): ReactElement {
  return (
    <>
      <BranchMoved detail={detail} />
      <FollowedBase detail={detail} />
      <BranchStatus detail={detail} />
    </>
  );
}
