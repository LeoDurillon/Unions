// Every preview holding containers, across projects, grouped by project: where it answers, whose it is, and Stop.

import type { ReactElement } from 'react';

import type { RunningPreview } from '../../../src/running-previews-types';
import { useRunningPreviews, useStopPreview } from '../../lib/preview/use-running-previews';
import { GuideLink } from '../guide/guide-link';
import { ErrorText } from '../ui/ui';
import { RunningPreviewRow } from './running-preview-row';

const GUIDE = ['previews', 'run-a-preview'] as const;

type ProjectGroup = { key: number; name: string; previews: RunningPreview[] };

/** The previews by project, in the order they come. */
function byProject(previews: RunningPreview[]): ProjectGroup[] {
  const groups = new Map<number, ProjectGroup>();
  for (const preview of previews) {
    const { id, owner, repo } = preview.project;
    const group = groups.get(id) ?? { key: id, name: `${owner}/${repo}`, previews: [] };
    group.previews.push(preview);
    groups.set(id, group);
  }
  return [...groups.values()];
}

/** No preview runs: what this page is for, and where to start one. */
function Empty(): ReactElement {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
      >
        ▶
      </span>
      <p className="font-semibold">No preview is running</p>
      <p className="max-w-md text-[13px] text-zinc-500">
        Start one from a ticket&apos;s Preview tab, or from a pull request&apos;s review. It shows
        here with its addresses until it stops.
      </p>
      <span className="text-xs">
        <GuideLink target={GUIDE} />
      </span>
    </div>
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
  const groups = byProject(list);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-[17px] font-semibold tracking-tight">Running previews</h2>
        <p className="text-xs text-zinc-500">
          Every project&apos;s previews that hold containers. Stopping one removes its containers
          and its data; start it again from its ticket or its review.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
          <ErrorText error={previews.error ?? stop.error} />
          {previews.data && list.length === 0 ? <Empty /> : null}
          {groups.map((group) => (
            <section key={group.key} aria-label={group.name} className="space-y-2.5">
              <h3 className="text-[13px] font-semibold">
                {group.name}{' '}
                <span className="font-normal text-zinc-500">{group.previews.length} running</span>
              </h3>
              <ul className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 [&>li:last-child]:border-b-0">
                {group.previews.map((preview) => (
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
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
