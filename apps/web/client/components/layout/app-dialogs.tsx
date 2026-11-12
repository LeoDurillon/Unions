// The dialog opened from the project bar: New ticket.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { PipelineStep } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { PublicProject, SourceImport } from '../../../src/api-types';
import type { Overlay } from '../../lib/app/use-navigation';
import { SourceImportPanel } from '../integrations/source-import';
import { FlowField } from '../new-ticket/flow-field';
import { GitHubImportPanel } from '../new-ticket/github-import';
import { TicketForm, type SourceRef } from '../new-ticket/ticket-form';
import { Dialog } from '../ui/ui';

/** `source`: the tracker item an edited import comes from, kept linked to the ticket. */
type Draft = { title: string; body: string; source: SourceRef | null; key: number };
type Source = 'write' | 'github' | IntegrationKindName;

/** Writing by hand always; importing from GitHub, or from each tracker the project is connected to. */
function sourcesFor(project: PublicProject): { id: Source; label: string }[] {
  return [
    { id: 'write', label: 'Write' },
    ...(project.githubAccess === 'none'
      ? []
      : [{ id: 'github' as const, label: 'Import from GitHub' }]),
    ...project.integrations
      .filter((integration) => integration.ready)
      .map(({ kind }) => ({ id: kind, label: `Import from ${integrationKind(kind).label}` })),
  ];
}

function TicketTabs({
  tabs,
  tab,
  onChange,
}: {
  tabs: { id: Source; label: string }[];
  tab: Source;
  onChange: (tab: Source) => void;
}): ReactElement {
  return (
    <div role="tablist" className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => {
            onChange(id);
          }}
          className={`border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-indigo-600 font-medium' : 'border-transparent text-zinc-500'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A tracker's item opened in the form, still linked to it. */
function editedDraft(kind: IntegrationKindName, item: SourceImport, previous: Draft): Draft {
  const source = { kind, id: item.id, url: item.url, title: item.title };
  return { title: item.title, body: item.body, source, key: previous.key + 1 };
}

/** New ticket: written by hand, or imported from a GitHub issue or pull request, or a tracker's item (a Notion page). */
function TicketBody({
  project,
  onCreated,
  onCancel,
}: {
  project: PublicProject;
  onCreated: (id: number) => void;
  onCancel: () => void;
}): ReactElement {
  const [tab, setTab] = useState<Source>('write');
  const tabs = sourcesFor(project);
  const [draft, setDraft] = useState<Draft>({ title: '', body: '', source: null, key: 0 });
  const [flow, setFlow] = useState<PipelineStep[] | null>(null);
  const picker = <FlowField project={project} value={flow} onChange={setFlow} />;
  const form = (
    <TicketForm
      key={draft.key}
      projectId={project.id}
      flow={flow}
      initialTitle={draft.title}
      initialBody={draft.body}
      source={draft.source}
      flowField={picker}
      onCreated={onCreated}
      onCancel={onCancel}
    />
  );
  if (tabs.length === 1) {
    return form;
  }
  return (
    <div className="space-y-4">
      <TicketTabs tabs={tabs} tab={tab} onChange={setTab} />
      {tab === 'write' ? form : null}
      {tab === 'github' ? (
        <GitHubImportPanel
          projectId={project.id}
          flow={flow}
          flowField={picker}
          onCreated={onCreated}
        />
      ) : null}
      {tab === 'write' || tab === 'github' ? null : picker}
      {tab === 'write' || tab === 'github' ? null : (
        <SourceImportPanel
          key={tab}
          projectId={project.id}
          kind={tab}
          flow={flow}
          onCreated={onCreated}
          onEdit={(item) => {
            setDraft((previous) => editedDraft(tab, item, previous));
            setTab('write');
          }}
        />
      )}
    </div>
  );
}

function TicketDialog({
  open,
  project,
  onClose,
  onCreated,
}: {
  open: boolean;
  project: PublicProject | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}): ReactElement {
  return (
    <Dialog open={open && project !== null} onClose={onClose} title="New ticket">
      {project ? <TicketBody project={project} onCreated={onCreated} onCancel={onClose} /> : null}
    </Dialog>
  );
}

/** The dialog opened from the project bar: New ticket. */
export function AppDialogs({
  overlay,
  project,
  onClose,
  onTicketCreated,
}: {
  overlay: Overlay;
  project: PublicProject | null;
  onClose: () => void;
  onTicketCreated: (id: number) => void;
}): ReactElement {
  return (
    <TicketDialog
      open={overlay === 'ticket'}
      project={project}
      onClose={onClose}
      onCreated={onTicketCreated}
    />
  );
}
