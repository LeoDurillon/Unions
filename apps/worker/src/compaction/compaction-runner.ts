// Runs the queued compactions of tickets' implementer sessions, sharing the run slots with the other agents.

import {
  claimSessionCompaction,
  finishSessionCompaction,
  recoverSessionCompactions,
  type SessionCompaction,
  type SessionCompactionOutcome,
} from '@union/core';

import { RunPool } from '../run-pool';
import { compactSession, type CompactionDeps } from './compaction-run';

/** Runs queued compactions within the run slots; a ticket's waits while its description is rewritten. */
export class CompactionRunner extends RunPool<SessionCompaction, SessionCompactionOutcome> {
  constructor(private readonly deps: CompactionDeps) {
    super({
      slots: deps.slots,
      claim: () => claimSessionCompaction(deps.db),
      run: (row, signal) => compactSession(deps, row, signal),
      failed: (error) => ({ status: 'failed', error }),
      stopped: { status: 'cancelled' },
      finish: (row, outcome) => {
        finishSessionCompaction(deps.db, row.id, outcome);
      },
    });
  }

  recover(): void {
    recoverSessionCompactions(this.deps.db);
  }
}
