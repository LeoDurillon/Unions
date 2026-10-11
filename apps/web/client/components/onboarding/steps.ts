import type { ReactElement } from 'react';

import { ConnectStep } from './connect-step';
import type { StepProps } from './draft';
import { NotionStep } from './notion-step';
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
