// The New ticket dialog's body: tabs to write the ticket or import it from GitHub or a tracker.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { PipelineStep } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { PublicProject, SourceImport } from '../../../src/api-types';
import { SourceImportPanel } from '../integrations/source-import';
import { FOCUS_RING } from '../ui/focus';
import { FlowField } from './flow-field';
import { GitHubImportPanel } from './github-import';
import { TicketForm, type SourceRef, type TicketText } from './ticket-form';

/** `source`: the tracker item an edited import comes from, kept linked to the ticket. */
type Draft = { source: SourceRef | null; key: number };
type Source = 'write' | 'github' | IntegrationKindName;

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
          className={`border-b-2 px-3 py-2 text-sm ${FOCUS_RING} ${tab === id ? 'border-indigo-600 font-medium' : 'border-transparent text-zinc-500'}`}
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
  return { source, key: previous.key + 1 };
}

type BodyProps = {
  project: PublicProject;
  /** The title and description typed so far, kept by the dialog. */
  text: TicketText;
  onText: (text: TicketText) => void;
  onCreated: (id: number) => void;
  onCancel: () => void;
};

/** New ticket: written by hand, or imported from a GitHub issue or pull request, or a tracker's item (a Notion page). */
export function TicketBody({
  project,
  text,
  onText,
  onCreated,
  onCancel,
}: BodyProps): ReactElement {
  const [tab, setTab] = useState<Source>('write');
  const tabs = sourcesFor(project);
  const [draft, setDraft] = useState<Draft>({ source: null, key: 0 });
  const [flow, setFlow] = useState<PipelineStep[] | null>(null);
  const picker = <FlowField project={project} value={flow} onChange={setFlow} />;
  const form = (
    <TicketForm
      key={draft.key}
      projectId={project.id}
      flow={flow}
      text={text}
      onText={onText}
      source={draft.source}
      flowField={picker}
      onCreated={onCreated}
      onCancel={onCancel}
    />
  );
  if (tabs.length === 1) {
    return form;
  }
  const tracker = tab === 'write' || tab === 'github' ? null : tab;
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
      {tracker === null ? null : picker}
      {tracker === null ? null : (
        <SourceImportPanel
          key={tracker}
          projectId={project.id}
          kind={tracker}
          flow={flow}
          onCreated={onCreated}
          onEdit={(item) => {
            onText({ title: item.title, body: item.body });
            setDraft((previous) => editedDraft(tracker, item, previous));
            setTab('write');
          }}
        />
      )}
    </div>
  );
}
