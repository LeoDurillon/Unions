// The setup proposal's cards made of commands and text: the checks, the e2e command and the project instructions.

import type { SetupChecks, SetupText } from '@union/core';
import { sectionApplied, checksChange } from '@union/core/setup-apply';
import { useState, type ReactElement } from 'react';

import { setupWrites, useSetupApply } from '../../lib/setup/use-setup-apply';
import { inputClass } from '../ui/ui';
import { SetupCard } from './setup-card';
import type { SetupCardProps } from './setup-card-props';
import { SetupField } from './setup-values';

export function ChecksCard({
  project,
  proposal,
  dismissed,
  onDismiss,
  checks,
}: SetupCardProps & { checks: SetupChecks }): ReactElement {
  const [draft, setDraft] = useState(checks);
  const { config } = project;
  const { apply, pending, error } = useSetupApply(() =>
    setupWrites(project.id).project(checksChange(draft)),
  );
  const applied = sectionApplied('checks', { ...proposal, checks: draft }, config);
  return (
    <SetupCard
      title="Checks"
      why={checks.why}
      state={{ applied, dismissed, pending, error }}
      onApply={apply}
      onDismiss={onDismiss}
    >
      <SetupField
        label="Install command"
        now={config.installCommand}
        proposed={draft.installCommand}
      >
        <input
          className={`${inputClass} font-mono text-xs`}
          value={draft.installCommand}
          onChange={(event) => {
            setDraft({ ...draft, installCommand: event.target.value });
          }}
        />
      </SetupField>
      <SetupField label="Check command" now={config.gateCommand} proposed={draft.gateCommand}>
        <input
          className={`${inputClass} font-mono text-xs`}
          value={draft.gateCommand}
          onChange={(event) => {
            setDraft({ ...draft, gateCommand: event.target.value });
          }}
        />
      </SetupField>
    </SetupCard>
  );
}

export function E2eCard({
  project,
  proposal,
  dismissed,
  onDismiss,
  e2e,
}: SetupCardProps & { e2e: SetupText }): ReactElement {
  const [command, setCommand] = useState(e2e.text);
  const { config } = project;
  const { preview } = config;
  const { apply, pending, error } = useSetupApply(() =>
    preview
      ? setupWrites(project.id).preview({ ...preview, e2eCommand: command })
      : Promise.reject(new Error('Apply the preview first: the e2e tests run against it')),
  );
  const applied = sectionApplied('e2e', { ...proposal, e2e: { ...e2e, text: command } }, config);
  return (
    <SetupCard
      title="End-to-end tests"
      why={e2e.why}
      state={{ applied, dismissed, pending, error }}
      onApply={preview ? apply : undefined}
      onDismiss={onDismiss}
    >
      <SetupField label="E2e command" now={preview?.e2eCommand} proposed={command}>
        <textarea
          className={`${inputClass} h-24 font-mono text-xs`}
          value={command}
          onChange={(event) => {
            setCommand(event.target.value);
          }}
        />
      </SetupField>
      {preview ? null : (
        <p className="text-xs text-zinc-500">Apply the preview first: the tests run against it.</p>
      )}
    </SetupCard>
  );
}

export function InstructionsCard({
  project,
  proposal,
  dismissed,
  onDismiss,
  instructions,
}: SetupCardProps & { instructions: SetupText }): ReactElement {
  const [text, setText] = useState(instructions.text);
  const { config } = project;
  const { apply, pending, error } = useSetupApply(() =>
    setupWrites(project.id).project({ instructions: text }),
  );
  const draft = { ...proposal, instructions: { ...instructions, text } };
  const replaces = (config.instructions ?? '').trim() !== '';
  return (
    <SetupCard
      title="Project instructions"
      why={instructions.why}
      state={{ applied: sectionApplied('instructions', draft, config), dismissed, pending, error }}
      onApply={apply}
      applyLabel={replaces ? 'Replace the instructions' : 'Apply'}
      onDismiss={onDismiss}
    >
      <textarea
        aria-label="Project instructions"
        className={`${inputClass} h-48 font-mono text-xs`}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {replaces ? (
        <p className="text-xs text-zinc-500">
          The project has instructions already: Apply replaces them with this text.
        </p>
      ) : null}
    </SetupCard>
  );
}
