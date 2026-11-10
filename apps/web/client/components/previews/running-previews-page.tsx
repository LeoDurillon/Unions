// Every preview holding containers, across projects: where it answers, whose it is, and Stop.

import type { ReactElement } from 'react';

import { useRunningPreviews, useStopPreview } from '../../lib/preview/use-running-previews';
import { ErrorText } from '../ui';
import { RunningPreviewRow } from './running-preview-row';

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
          <RunningPreviewRow
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
