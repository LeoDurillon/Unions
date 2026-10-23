// Runs queued rewrites of pull request descriptions, sharing the run slots with the ticket
// pipeline, the investigations and the agent reviews.
import {
  claimPrDescription,
  finishPrDescription,
  recoverPrDescriptions,
  type PrDescription,
  type PrDescriptionOutcome,
} from '@union/core';

import { rewrite, type PrDescriptionDeps } from './pr-description-run';
import { RunPool } from './run-pool';

/**
 * Runs queued rewrites of pull request descriptions, sharing the run slots with the ticket pipeline,
 * the investigations and the agent reviews. Nothing reaches GitHub here: the user sends the draft.
 */
export class PrDescriptionRunner extends RunPool<PrDescription, PrDescriptionOutcome> {
  constructor(private readonly deps: PrDescriptionDeps) {
    super({
      slots: deps.slots,
      claim: () => claimPrDescription(deps.db),
      run: (row, signal) => rewrite(deps, row, signal),
      failed: (error) => ({ status: 'failed', error }),
      stopped: { status: 'cancelled' },
      finish: (row, outcome) => {
        finishPrDescription(deps.db, row.id, outcome);
      },
    });
  }

  recover(): void {
    recoverPrDescriptions(this.deps.db);
  }
}
