import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { Dialog } from '../ui';
import { BranchSection } from './branch-section';
import { ChecksSection } from './checks-section';
import { DeleteSection } from './delete-section';
import { GitHubAccessSection } from './github-access-section';
import { NotionSection } from './notion-section';
import { PullRequestSection } from './pull-request-section';
import { ReviewSection } from './review-section';

const PANES = [
  { id: 'general', label: 'General' },
  { id: 'checks', label: 'Checks' },
  { id: 'pull-requests', label: 'Pull requests' },
  { id: 'review', label: 'Review' },
  { id: 'notion', label: 'Notion' },
  { id: 'danger', label: 'Danger zone' },
] as const;
type Pane = (typeof PANES)[number]['id'];

function PaneTabs({
  pane,
  onChange,
}: {
  pane: Pane;
  onChange: (pane: Pane) => void;
}): ReactElement {
  return (
    <div role="tablist" className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {PANES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={pane === id}
          onClick={() => {
            onChange(id);
          }}
          className={`border-b-2 px-3 py-2 text-sm transition ${pane === id ? 'border-indigo-600 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PaneBody({
  pane,
  project,
  onDeleted,
}: {
  pane: Pane;
  project: PublicProject;
  onDeleted: () => void;
}): ReactElement {
  const bodies: Record<Pane, ReactElement> = {
    general: (
      <div className="space-y-6">
        <GitHubAccessSection project={project} />
        <BranchSection project={project} />
      </div>
    ),
    checks: <ChecksSection project={project} />,
    'pull-requests': <PullRequestSection project={project} />,
    review: <ReviewSection project={project} />,
    notion: <NotionSection project={project} />,
    danger: <DeleteSection project={project} onDeleted={onDeleted} />,
  };
  return bodies[pane];
}

export function SettingsDialog({
  project,
  open,
  onClose,
}: {
  project: PublicProject | null;
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const [pane, setPane] = useState<Pane>('general');
  return (
    <Dialog
      open={open && project !== null}
      onClose={onClose}
      title={project ? `${project.owner}/${project.repo} settings` : 'Settings'}
    >
      {project ? (
        <div key={project.id} className="space-y-4">
          <PaneTabs pane={pane} onChange={setPane} />
          <PaneBody pane={pane} project={project} onDeleted={onClose} />
        </div>
      ) : null}
    </Dialog>
  );
}
