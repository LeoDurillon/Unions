// Every preview holding containers, across projects: where it answers, whose it is, and Stop.
import type { ReactElement } from 'react';

import type { RunningPreview } from '../../../src/running-previews-types';
import { useRunningPreviews, useStopPreview } from '../../lib/use-running-previews';
import { PREVIEW_STATUS } from '../preview-section';
import { Badge, Button, ErrorText } from '../ui';

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

function Row({
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
          {preview.startedAt ? ` · started ${new Date(preview.startedAt).toLocaleString()}` : ''}
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

/**
 * The previews holding containers, whatever their project: tickets' and pull requests' under
 * review. They count against the cap; Stop takes one down (the worker does), its data with it.
 */
export function RunningPreviewsPage({
  onOpenTicket,
}: {
  onOpenTicket: (projectId: number, ticketId: number) => void;
}): ReactElement {
  const previews = useRunningPreviews();
  const stop = useStopPreview();
  const list = previews.data ?? [];
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Running previews</h2>
        <p className="text-xs text-zinc-500">
          Every project&apos;s previews that hold containers. Stopping one removes its containers
          and its data; start it again from its ticket or its review.
        </p>
      </header>
      <ErrorText error={previews.error ?? stop.error} />
      {previews.data && list.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-zinc-500">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">No preview is running.</p>
          <p className="mt-1">
            Start one from a ticket&apos;s Preview tab, or from a pull request&apos;s review.
          </p>
        </div>
      ) : null}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {list.map((preview) => (
          <Row
            key={preview.id}
            preview={preview}
            stopping={stop.isPending && stop.variables === preview.id}
            onStop={() => {
              stop.mutate(preview.id);
            }}
            onOpenTicket={onOpenTicket}
          />
        ))}
      </ul>
    </div>
  );
}
