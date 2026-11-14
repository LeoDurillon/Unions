// Runs the queued checks of setup proposals, two at a time, each in its own throwaway container; no Claude usage.

import {
  claimSetupCheck,
  finishSetupCheck,
  recoverSetupChecks,
  type SetupCheck,
  type SetupCheckOutcome,
} from '@union/core';

import { RunPool } from '../run-pool';
import { RunSlots } from '../slots';
import { removeThrowaway } from '../throwaway-container';
import { runSetupCheck, setupCheckContainer, type SetupCheckDeps } from './setup-check-run';

/** Checks at the same time: each clones the repository and may install its dependencies. */
const MAX_PARALLEL = 2;

const STOPPED = 'The worker stopped during the check: test it again.';

/** Runs the checks of setup proposals without Claude; they do not take the agents' run slots. */
export class SetupChecker extends RunPool<SetupCheck, SetupCheckOutcome> {
  constructor(private readonly deps: SetupCheckDeps) {
    super({
      slots: new RunSlots(MAX_PARALLEL),
      claim: () => claimSetupCheck(deps.db),
      run: (check, signal) => runSetupCheck(deps, check, signal),
      failed: (error) => ({ status: 'failed', output: error }),
      stopped: { status: 'failed', output: STOPPED },
      finish: (check, outcome) => {
        finishSetupCheck(deps.db, check.id, outcome);
      },
    });
  }

  /** Fails the checks a stopped worker left running and removes their containers. */
  async recover(): Promise<void> {
    for (const id of recoverSetupChecks(this.deps.db)) {
      await removeThrowaway(this.deps, setupCheckContainer(id));
    }
  }
}
