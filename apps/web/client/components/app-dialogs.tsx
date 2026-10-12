import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import type { Overlay } from '../lib/use-navigation';
import { GitHubIssueImportPanel } from './github-issue-import';
import { NotionImportPanel } from './notion-import';
import { SettingsDialog } from './settings/settings-dialog';
import { TicketForm } from './ticket-form';
import { Dialog } from './ui';

type Draft = { title: string; body: string; key: number };
type Source = 'write' | 'github' | 'notion';

/** Writing by hand always; importing from GitHub or Notion when the project reaches them. */
function sourcesFor(project: PublicProject): { id: Source; label: string }[] {
  return [
    { id: 'write', label: 'Write' },
    ...(project.githubAccess === 'none'
      ? []
      : [{ id: 'github' as const, label: 'Import from GitHub' }]),
    ...(project.hasNotion ? [{ id: 'notion' as const, label: 'Import from Notion' }] : []),
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

/** New ticket: written by hand, or imported from a GitHub issue or a Notion page. */
function TicketBody({
  project,
  onCreated,
}: {
  project: PublicProject;
  onCreated: (id: number) => void;
}): ReactElement {
  const [tab, setTab] = useState<Source>('write');
  const tabs = sourcesFor(project);
  const [draft, setDraft] = useState<Draft>({ title: '', body: '', key: 0 });
  const form = (
    <TicketForm
      key={draft.key}
      projectId={project.id}
      initialTitle={draft.title}
      initialBody={draft.body}
      onCreated={onCreated}
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
        <GitHubIssueImportPanel projectId={project.id} onCreated={onCreated} />
      ) : null}
      {tab === 'notion' ? (
        <NotionImportPanel
          projectId={project.id}
          onCreated={onCreated}
          onEdit={(title, body) => {
            setDraft((previous) => ({ title, body, key: previous.key + 1 }));
            setTab('write');
          }}
        />
      ) : null}
    </div>
  );
}

export function TicketDialog({
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
      {project ? <TicketBody project={project} onCreated={onCreated} /> : null}
    </Dialog>
  );
}

/** The dialogs opened from the project bar: project settings and New ticket. */
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
    <>
      <SettingsDialog project={project} open={overlay === 'settings'} onClose={onClose} />
      <TicketDialog
        open={overlay === 'ticket'}
        project={project}
        onClose={onClose}
        onCreated={onTicketCreated}
      />
    </>
  );
}
