// The wizard's last question: whether an agent sets up the new project, and the model it runs with.
import type { ReactElement } from 'react';

import { ModelField } from '../agents/model-field';
import { Switch } from '../choice';
import type { StepProps } from './draft';

export function SetupAgentChoice({ draft, patch }: StepProps): ReactElement {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <Switch
        checked={draft.setupAgent}
        onChange={(setupAgent) => {
          patch({ setupAgent });
        }}
        hint="It reads the repository and proposes the checks, the preview, the e2e command, scripts and instructions. You review each one before it is applied. Uses your Claude subscription."
      >
        Let an agent set up this project
      </Switch>
      {draft.setupAgent ? (
        <ModelField
          model={draft.setupModel}
          onChange={(setupModel) => {
            patch({ setupModel });
          }}
        />
      ) : null}
    </div>
  );
}
