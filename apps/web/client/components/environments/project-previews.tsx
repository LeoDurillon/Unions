// The project's previews that hold containers now, tickets' and pull requests', with Stop.

import type { ReactElement } from 'react';

import { useRunningPreviews, useStopPreview } from '../../lib/preview/use-running-previews';
import { RunningPreviewRow } from '../previews/running-preview-row';
import { ErrorText } from '../ui';

/** What runs for the project now: its previews, each with its addresses and Stop. */
export function ProjectPreviews({
  projectId,
  onOpenTicket,
}: {
  projectId: number;
  onOpenTicket: (ticketId: number) => void;
}): ReactElement {
  const previews = useRunningPreviews();
  const stop = useStopPreview();
  const list = (previews.data ?? []).filter((preview) => preview.project.id === projectId);
  return (
    <section aria-labelledby="running-now" className="space-y-2">
      <h3 id="running-now" className="text-sm font-semibold">
        Running now
      </h3>
      <ErrorText error={previews.error ?? stop.error} />
      {previews.data && list.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No preview of this project is running. Start one from a ticket&apos;s Preview tab, or from
          a pull request&apos;s review.
        </p>
      ) : (
        <ul className="rounded-md border border-zinc-200 dark:border-zinc-800 [&>li:last-child]:border-b-0">
          {list.map((preview) => (
            <RunningPreviewRow
              key={preview.id}
              preview={preview}
              stopping={stop.isPending && stop.variables === preview.id}
              onStop={() => {
                stop.mutate(preview.id);
              }}
              onOpenTicket={(_project, ticketId) => {
                onOpenTicket(ticketId);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
