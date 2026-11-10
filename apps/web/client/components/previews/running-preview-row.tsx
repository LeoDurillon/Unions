// One preview holding containers: its state, the ticket or pull request it is for, its addresses, and Stop.

import type { ReactElement } from 'react';

import type { RunningPreview } from '../../../src/running-previews-types';
import { PREVIEW_STATUS } from '../../lib/preview/preview-status';
import { formatWhen } from '../../lib/relative-time';
import { Badge, Button } from '../ui';

const LINK = 'text-indigo-600 hover:underline dark:text-indigo-400';

/** The ticket (opened in its panel) or the pull request (on GitHub) the preview belongs to. */
function Owner({
  preview,
  onOpenTicket,
}: {
  preview: RunningPreview;
  onOpenTicket: (projectId: number, ticketId: number) => void;
}): ReactElement {
  const { owner, project } = preview;
  if (owner.kind === 'ticket') {
    return (
      <button
        type="button"
        className={`truncate text-left text-sm font-medium ${LINK}`}
        onClick={() => {
          onOpenTicket(project.id, owner.ticketId);
        }}
      >
        Ticket {owner.ticketId}: {owner.title}
      </button>
    );
  }
  return (
    <a
      className={`truncate text-sm font-medium ${LINK}`}
      href={owner.url}
      target="_blank"
      rel="noreferrer"
    >
      #{owner.number} {owner.title} ↗
    </a>
  );
}

function Links({ preview }: { preview: RunningPreview }): ReactElement | null {
  if (preview.status !== 'running') {
    return null;
  }
  const urls = preview.urls ?? (preview.url ? [{ service: '', url: preview.url }] : []);
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs">
      {urls.map(({ service, url }) => (
        <li key={url}>
          <a
            className="inline-block rounded-full border border-indigo-200 px-2 py-0.5 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            href={url}
            target="_blank"
            rel="noreferrer"
            title={url}
          >
            {service === '' ? 'Open' : service} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

/** One preview: its state, whose it is, where it answers, and Stop. */
export function RunningPreviewRow({
  preview,
  stopping,
  onStop,
  onOpenTicket,
}: {
  preview: RunningPreview;
  stopping: boolean;
  onStop: () => void;
  onOpenTicket: (projectId: number, ticketId: number) => void;
}): ReactElement {
  const status = PREVIEW_STATUS[preview.status];
  return (
    <li className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Owner preview={preview} onOpenTicket={onOpenTicket} />
        </div>
        <p className="text-xs text-zinc-500">
          {preview.project.owner}/{preview.project.repo}
          {preview.startedAt ? ` · started ${formatWhen(preview.startedAt)}` : ''}
        </p>
        <Links preview={preview} />
      </div>
      <Button
        disabled={stopping || preview.stopRefusal !== null}
        title={preview.stopRefusal ?? undefined}
        onClick={onStop}
      >
        Stop
      </Button>
    </li>
  );
}
