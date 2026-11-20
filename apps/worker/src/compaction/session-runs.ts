// The side runs that resume a ticket's implementer session: PR description rewrites and compactions.

import type { PrDescriptionDeps } from '../pull-request/pr-description-run';
import { PrDescriptionRunner } from '../pull-request/pr-description-runner';
import { CompactionRunner } from './compaction-runner';

export type SessionRuns = { prDescriptions: PrDescriptionRunner; compactions: CompactionRunner };

/** Both runners, each with what a stopped worker left already failed. */
export function startSessionRuns(deps: PrDescriptionDeps): SessionRuns & {
  all: readonly (PrDescriptionRunner | CompactionRunner)[];
} {
  const prDescriptions = new PrDescriptionRunner(deps);
  const compactions = new CompactionRunner(deps);
  prDescriptions.recover();
  compactions.recover();
  return { prDescriptions, compactions, all: [prDescriptions, compactions] };
}
