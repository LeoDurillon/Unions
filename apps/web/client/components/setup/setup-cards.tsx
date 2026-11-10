// The cards of a setup proposal's sections, in the order a project is set up: checks, scripts, preview, e2e, then the rest.
import type { SetupProposal } from '@union/core';
import type { ReactElement } from 'react';

import type { SetupCardProps } from './setup-card-props';
import { AgentImageCard, ScriptsCard } from './setup-config-cards';
import { PreviewCard } from './setup-preview-card';
import { ChecksCard, E2eCard, InstructionsCard } from './setup-text-cards';
import { ProjectFilesCard, SecretsCard } from './setup-todo-cards';

/** The props of a section's card, by its key: its dismissed state included. */
export type CardOf = (key: string) => SetupCardProps;

export function SetupCards({
  cardOf,
  proposal,
}: {
  cardOf: CardOf;
  proposal: SetupProposal;
}): ReactElement {
  const { checks, scripts, preview, e2e, secrets, projectFiles, instructions, agentImage } =
    proposal;
  return (
    <div className="space-y-3">
      {checks ? <ChecksCard {...cardOf('checks')} checks={checks} /> : null}
      {scripts ? <ScriptsCard {...cardOf('scripts')} scripts={scripts} /> : null}
      {preview ? <PreviewCard {...cardOf('preview')} preview={preview} /> : null}
      {e2e ? <E2eCard {...cardOf('e2e')} e2e={e2e} /> : null}
      {secrets.length > 0 ? <SecretsCard {...cardOf('secrets')} secrets={secrets} /> : null}
      {projectFiles.length > 0 ? (
        <ProjectFilesCard {...cardOf('projectFiles')} files={projectFiles} />
      ) : null}
      {instructions ? (
        <InstructionsCard {...cardOf('instructions')} instructions={instructions} />
      ) : null}
      {agentImage ? <AgentImageCard {...cardOf('agentImage')} image={agentImage} /> : null}
    </div>
  );
}
