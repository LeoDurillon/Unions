import type { ReactElement } from 'react';

import { Wizard } from './onboarding/wizard';

/** The setup wizard: unavoidable on first run, dismissible when adding another project. */
export function WizardHost({
  firstRun,
  open,
  onFinished,
  onClose,
}: {
  firstRun: boolean;
  open: boolean;
  onFinished: (projectId: number) => void;
  onClose: () => void;
}): ReactElement | null {
  if (!firstRun && !open) {
    return null;
  }
  return <Wizard onFinished={onFinished} onClose={firstRun ? undefined : onClose} />;
}
