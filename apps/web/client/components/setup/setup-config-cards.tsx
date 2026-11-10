// The setup proposal's saved scripts and agent image cards.
import type { ProjectScript, SetupScripts, SetupText } from '@union/core';
import { sectionApplied, scriptsAfter } from '@union/core/setup-apply';
import { useState, type ReactElement } from 'react';

import { useAgentImage } from '../../lib/use-agent-image';
import { setupWrites, useSetupApply } from '../../lib/use-setup-apply';
import { CodeTextarea } from '../code-textarea';
import { inputClass } from '../ui';
import { SetupCard } from './setup-card';
import type { SetupCardProps } from './setup-card-props';

function ScriptRow({
  script,
  onChange,
}: {
  script: ProjectScript;
  onChange: (script: ProjectScript) => void;
}): ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{script.name}</span>
      <input
        className={`${inputClass} font-mono text-xs`}
        value={script.command}
        onChange={(event) => {
          onChange({ ...script, command: event.target.value });
        }}
      />
    </label>
  );
}

export function ScriptsCard({
  project,
  proposal,
  dismissed,
  onDismiss,
  scripts,
}: SetupCardProps & { scripts: SetupScripts }): ReactElement {
  const [items, setItems] = useState(scripts.items);
  const { config } = project;
  const { apply, pending, error } = useSetupApply(() =>
    setupWrites(project.id).project({ scripts: scriptsAfter(config.scripts, items) }),
  );
  const applied = sectionApplied(
    'scripts',
    { ...proposal, scripts: { ...scripts, items } },
    config,
  );
  return (
    <SetupCard
      title="Saved scripts"
      why={scripts.why}
      state={{ applied, dismissed, pending, error }}
      onApply={apply}
      onDismiss={onDismiss}
    >
      {items.map((script, index) => (
        <ScriptRow
          key={script.name}
          script={script}
          onChange={(changed) => {
            setItems(items.map((item, at) => (at === index ? changed : item)));
          }}
        />
      ))}
      <p className="text-xs text-zinc-500">
        Added to the project&apos;s scripts; one with the same name is replaced.
      </p>
    </SetupCard>
  );
}

/** Applied once the project's image, built or waiting to be, is this Dockerfile. */
export function AgentImageCard({
  project,
  dismissed,
  onDismiss,
  image,
}: SetupCardProps & { image: SetupText }): ReactElement {
  const [dockerfile, setDockerfile] = useState(image.text);
  const { image: current } = useAgentImage(project.id);
  const { apply, pending, error } = useSetupApply(() =>
    setupWrites(project.id).dockerfile(dockerfile),
  );
  const saved = [current.data?.pending, current.data?.applied].some(
    (source) => source?.kind === 'dockerfile' && source.dockerfile === dockerfile,
  );
  return (
    <SetupCard
      title="Agent image"
      why={image.why}
      state={{ applied: saved, dismissed, pending, error }}
      onApply={apply}
      onDismiss={onDismiss}
    >
      <CodeTextarea
        language="dockerfile"
        className="h-40"
        aria-label="Dockerfile"
        value={dockerfile}
        onChange={setDockerfile}
      />
      <p className="text-xs text-zinc-500">
        Apply saves it; Union builds it, and the agents use it once the build has passed.
      </p>
    </SetupCard>
  );
}
