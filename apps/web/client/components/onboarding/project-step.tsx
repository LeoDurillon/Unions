import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { ProjectOption } from '../../../src/api-types';
import { api } from '../../lib/api';
import { ErrorText, inputClass } from '../ui';
import { credentialOf, type ProjectChoice, type StepProps } from './draft';

const CHOICE_ON = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40';
const CHOICE_OFF = 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800';

function Radio({ selected, onSelect }: { selected: boolean; onSelect: () => void }): ReactElement {
  return (
    <input
      type="radio"
      name="github-project"
      className="sr-only"
      checked={selected}
      onChange={onSelect}
    />
  );
}

function ExistingProject({
  project,
  selected,
  onSelect,
}: {
  project: ProjectOption;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <label
      className={`block cursor-pointer rounded-lg border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${selected ? CHOICE_ON : CHOICE_OFF}`}
    >
      <Radio selected={selected} onSelect={onSelect} />
      <span className="block text-sm font-medium">{project.title}</span>
      <span className="text-xs text-zinc-500">Project #{project.number}</span>
    </label>
  );
}

function NewProject({ draft, patch }: StepProps): ReactElement {
  const choice: ProjectChoice = draft.project;
  const selected = choice?.kind === 'new';
  const title = choice?.kind === 'new' ? choice.title : `${draft.repo?.name ?? 'union'} board`;
  const select = (next: string): void => {
    patch({ project: { kind: 'new', title: next } });
  };
  return (
    <div
      className={`space-y-2 rounded-lg border p-3 transition ${selected ? CHOICE_ON : CHOICE_OFF}`}
    >
      <label className="block cursor-pointer text-sm font-medium has-[:focus-visible]:underline">
        <input
          type="radio"
          name="github-project"
          className="sr-only"
          checked={selected}
          onChange={() => {
            select(title);
          }}
        />
        Create a new project
      </label>
      <input
        className={inputClass}
        value={title}
        aria-label="New project title"
        onFocus={() => {
          select(title);
        }}
        onChange={(event) => {
          select(event.target.value);
        }}
      />
    </div>
  );
}

export function ProjectStep({ draft, patch }: StepProps): ReactElement {
  const owner = draft.repo?.owner ?? '';
  const query = useQuery({
    queryKey: ['gh-projects', credentialOf(draft), owner],
    queryFn: () => api.github.projects(credentialOf(draft), owner),
    enabled: owner !== '',
  });
  const chosen = draft.project;

  return (
    <div className="space-y-3">
      <ErrorText error={query.error} />
      {query.isPending ? (
        <p className="text-sm text-zinc-500">Loading projects of {owner}…</p>
      ) : null}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {(query.data ?? []).map((project) => (
          <ExistingProject
            key={project.id}
            project={project}
            selected={chosen?.kind === 'existing' && chosen.project.id === project.id}
            onSelect={() => {
              patch({ project: { kind: 'existing', project } });
            }}
          />
        ))}
        <NewProject draft={draft} patch={patch} />
      </div>
    </div>
  );
}
