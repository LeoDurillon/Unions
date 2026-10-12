import { useQuery } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Badge, Button, ErrorText } from '../ui';
import { InvestigationDetail } from './investigation-detail';
import { InvestigationForm } from './investigation-form';
import { SCOPE_LABELS, STATUS_LABELS } from './investigation-labels';

const ITEM_ON = 'bg-indigo-100 dark:bg-indigo-950';
const ITEM_OFF = 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60';

type Selection = number | 'new';

function InvestigationItem({
  investigation,
  selected,
  onSelect,
}: {
  investigation: Investigation;
  selected: boolean;
  onSelect: (id: number) => void;
}): ReactElement {
  const status = STATUS_LABELS[investigation.status];
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => {
          onSelect(investigation.id);
        }}
        className={`block w-full space-y-1 rounded-md px-3 py-2 text-left transition ${selected ? ITEM_ON : ITEM_OFF}`}
      >
        <span className="block truncate text-sm font-medium">{investigation.title}</span>
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          <Badge tone={status.tone}>{status.label}</Badge>
          {SCOPE_LABELS[investigation.scope].title}
          <span className="ml-auto">{new Date(investigation.createdAt).toLocaleDateString()}</span>
        </span>
      </button>
    </li>
  );
}

function Detail({
  project,
  investigations,
  selection,
  onSelect,
}: {
  project: PublicProject;
  investigations: Investigation[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}): ReactElement {
  const current = investigations.find((investigation) => investigation.id === selection);
  if (!current) {
    return <InvestigationForm project={project} onCreated={onSelect} />;
  }
  return (
    <InvestigationDetail
      key={`${current.id}-${current.status}`}
      investigation={current}
      onDeleted={() => {
        onSelect('new');
      }}
    />
  );
}

function ProjectInvestigations({ project }: { project: PublicProject }): ReactElement {
  const query = useQuery({
    queryKey: ['investigations', project.id],
    queryFn: () => api.investigations(project.id),
  });
  const [selection, setSelection] = useState<Selection>('new');
  const investigations = query.data ?? [];
  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="Investigations"
        className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-r border-zinc-200 p-3 dark:border-zinc-800"
      >
        <Button
          variant="primary"
          onClick={() => {
            setSelection('new');
          }}
        >
          + New investigation
        </Button>
        <ErrorText error={query.error} />
        <ul className="space-y-0.5">
          {investigations.map((investigation) => (
            <InvestigationItem
              key={investigation.id}
              investigation={investigation}
              selected={investigation.id === selection}
              onSelect={setSelection}
            />
          ))}
        </ul>
        {query.isSuccess && investigations.length === 0 ? (
          <p className="px-3 text-sm text-zinc-500">No investigation yet.</p>
        ) : null}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4">
          <Detail
            project={project}
            investigations={investigations}
            selection={selection}
            onSelect={setSelection}
          />
        </div>
      </div>
    </div>
  );
}

/** Ad-hoc agent runs on a custom prompt for the current project; no GitHub issue is created. */
export function InvestigationsPage({ project }: { project: PublicProject | null }): ReactElement {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-base font-semibold">
          Investigations
          {project ? (
            <span className="ml-2 font-normal text-zinc-500">
              {project.owner}/{project.repo}
            </span>
          ) : null}
        </h2>
        <p className="text-xs text-zinc-500">
          Run an agent on your own prompt, about the repository or a general subject. Nothing is
          posted to GitHub.
        </p>
      </header>
      {project ? (
        <ProjectInvestigations key={project.id} project={project} />
      ) : (
        <p className="p-4 text-sm text-zinc-500">Add a project first.</p>
      )}
    </div>
  );
}
