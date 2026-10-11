import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import type { Overlay } from '../lib/use-navigation';
import { NotionImportPanel } from './notion-import';
import { SettingsDialog } from './settings/settings-dialog';
import { TicketForm } from './ticket-form';
import { Dialog } from './ui';

type Draft = { title: string; body: string; key: number };

function TicketTabs({
  tab,
  onChange,
}: {
  tab: 'write' | 'notion';
  onChange: (tab: 'write' | 'notion') => void;
}): ReactElement {
  const tabs = [
    { id: 'write', label: 'Write' },
    { id: 'notion', label: 'Import from Notion' },
  ] as const;
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

/** New ticket: written by hand, or imported from Notion when the project is connected. */
function TicketBody({
  project,
  onCreated,
}: {
  project: PublicProject;
  onCreated: (id: number) => void;
}): ReactElement {
  const [tab, setTab] = useState<'write' | 'notion'>('write');
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
  if (!project.hasNotion) {
    return form;
  }
  return (
    <div className="space-y-4">
      <TicketTabs tab={tab} onChange={setTab} />
      {tab === 'write' ? (
        form
      ) : (
        <NotionImportPanel
          projectId={project.id}
          onCreated={onCreated}
          onEdit={(title, body) => {
            setDraft((previous) => ({ title, body, key: previous.key + 1 }));
            setTab('write');
          }}
        />
      )}
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
