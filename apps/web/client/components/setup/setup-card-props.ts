// What every card of a setup proposal gets: the project, the setup run, its proposal and checks, and its dismissed state.
import type { Investigation, SetupCheckResults, SetupProposal } from '@union/core';

import type { PublicProject } from '../../../src/api-types';

export type SetupCardProps = {
  project: PublicProject;
  investigation: Investigation;
  proposal: SetupProposal;
  /** Union's latest checks of the proposal's values. */
  checkResults: SetupCheckResults;
  dismissed: boolean;
  onDismiss: (dismissed: boolean) => void;
};
