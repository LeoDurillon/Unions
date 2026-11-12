// The setup proposal's preview card: its compose file and additions to edit, the rest of its settings to read, then Apply.

import type { SetupPreview } from '@union/core';
import { previewAfter, sectionApplied } from '@union/core/setup-apply';
import { useState, type ReactElement } from 'react';

import { setupWrites, useSetupApply } from '../../lib/setup/use-setup-apply';
import { CodeTextarea } from '../ui/code-textarea';
import { inputClass } from '../ui/ui';
import { SetupCard } from './setup-card';
import type { SetupCardProps } from './setup-card-props';
import { SetupField, SetupList } from './setup-values';

function flagText(label: string, value: boolean | null): string[] {
  return value === null ? [] : [`${label}: ${value ? 'on' : 'off'}`];
}

/** What the card shows of the proposal without letting it be edited: change those in Environments. */
function PreviewValues({ preview }: { preview: SetupPreview }): ReactElement {
  return (
    <div className="space-y-1.5">
      <SetupList
        label="Served services"
        items={preview.services.map(({ name, port, prefix }) =>
          prefix === '' ? `${name}:${port}` : `${name}:${port} (${prefix})`,
        )}
      />
      <SetupList
        label="Variables"
        items={Object.entries(preview.env).map(([name, value]) => `${name}=${value}`)}
      />
      <SetupList label="Profiles" items={preview.profiles} />
      <SetupList label="For the agent" items={preview.agentServices} />
      <SetupList label="Shared" items={preview.sharedServices} />
      <SetupList
        label="Data per preview"
        items={preview.sharedCommands.map(({ service, create }) => `${service}: ${create ?? ''}`)}
      />
      <SetupList
        label="Options"
        items={[
          ...flagText('Reach the agent services on localhost', preview.forwardPorts),
          ...flagText('Start the preview for implementation steps', preview.startForImplementation),
        ]}
      />
    </div>
  );
}

export function PreviewCard({
  project,
  proposal,
  dismissed,
  onDismiss,
  preview,
}: SetupCardProps & { preview: SetupPreview }): ReactElement {
  const [draft, setDraft] = useState(preview);
  const current = project.config.preview;
  const { apply, pending, error } = useSetupApply(() =>
    setupWrites(project.id).preview(previewAfter(current, draft)),
  );
  const applied = sectionApplied('preview', { ...proposal, preview: draft }, project.config);
  return (
    <SetupCard
      title="Preview"
      why={preview.why}
      state={{ applied, dismissed, pending, error }}
      onApply={apply}
      onDismiss={onDismiss}
    >
      <SetupField label="Compose file" now={current?.composeFile} proposed={draft.composeFile}>
        <input
          className={`${inputClass} font-mono text-xs`}
          value={draft.composeFile}
          onChange={(event) => {
            setDraft({ ...draft, composeFile: event.target.value });
          }}
        />
      </SetupField>
      {draft.composeAdditions === '' && preview.composeAdditions === '' ? null : (
        <SetupField
          label="Compose additions"
          now={current?.composeAdditions?.trimEnd()}
          proposed={draft.composeAdditions}
        >
          <CodeTextarea
            language="yaml"
            className="h-56"
            aria-label="Compose additions"
            value={draft.composeAdditions}
            onChange={(composeAdditions) => {
              setDraft({ ...draft, composeAdditions });
            }}
          />
        </SetupField>
      )}
      <PreviewValues preview={draft} />
      <p className="text-xs text-zinc-500">
        Apply keeps the variables and settings the project has already; change the rest in
        Environments afterwards.
      </p>
    </SetupCard>
  );
}
