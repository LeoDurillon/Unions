// The setup wizard's views, one per entry of `STEPS`, in the same order.
import type { ReactElement } from 'react';

import { NotionStep } from '../integrations/notion/notion-step';
import { ConnectStep } from './connect-step';
import type { StepProps } from './draft';
import { ProjectStep } from './project-step';
import { RepositoryStep } from './repository-step';
import { ReviewStep } from './review-step';

/** One view per entry of `STEPS`, in the same order. */
export const STEP_VIEWS: readonly ((props: StepProps) => ReactElement)[] = [
  ConnectStep,
  RepositoryStep,
  ProjectStep,
  NotionStep,
  ReviewStep,
];
