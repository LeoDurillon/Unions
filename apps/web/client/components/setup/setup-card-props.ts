// What every card of a setup proposal gets: the project, the whole proposal, and its dismissed state.
import type { SetupProposal } from '@union/core';

import type { PublicProject } from '../../../src/api-types';

export type SetupCardProps = {
  project: PublicProject;
  proposal: SetupProposal;
  dismissed: boolean;
  onDismiss: (dismissed: boolean) => void;
};
