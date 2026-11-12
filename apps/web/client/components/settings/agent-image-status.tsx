// The agent image page's state: what the agents run on, the save being built or why it was not
// applied. Also the build's log, and the page's shape while it is read.

import { formatBytes } from '@union/core/attachment-limits';
import type { ReactElement } from 'react';

import type { AgentImageView } from '../../../src/routes/agent-image';
import { isBuilding } from '../../lib/settings/use-agent-image';
import { timeAgo } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { Bone, Loading } from '../ui/skeleton';
import { Badge } from '../ui/ui';

function appliedName(view: AgentImageView): string {
  if (!view.applied) {
    return 'the default image';
  }
  return view.applied.kind === 'image' ? view.applied.ref : 'the project’s Dockerfile';
}

/** What the agents run on now, whatever is being built. */
function InUse({ view }: { view: AgentImageView }): ReactElement {
  const now = useNow(false);
  const { applied } = view;
  if (!applied) {
    return (
      <p className="text-xs text-zinc-500">The agents run on the default image (union-agent).</p>
    );
  }
  const size = applied.sizeBytes === null ? '' : ` · ${formatBytes(applied.sizeBytes)}`;
  return (
    <p className="text-xs text-zinc-500">
      The agents run on {appliedName(view)} <span className="font-mono">{applied.tag}</span>,
      applied {timeAgo(applied.appliedAt, now)}
      {size}.
    </p>
  );
}

function BuildBadge({ view }: { view: AgentImageView }): ReactElement | null {
  const badges: Record<AgentImageView['status'], ReactElement | null> = {
    queued: <Badge tone="blue">Waiting for the worker…</Badge>,
    building: <Badge tone="blue">Building and checking…</Badge>,
    failed: <Badge tone="red">Build failed: not applied</Badge>,
    idle: view.finishedAt === null ? null : <Badge tone="green">Applied</Badge>,
  };
  return badges[view.status];
}

/** The build's state, the error that kept a save from being applied, and the log (open while it matters). */
export function AgentImageStatus({ view }: { view: AgentImageView }): ReactElement {
  const failed = view.status === 'failed';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <BuildBadge view={view} />
        <InUse view={view} />
      </div>
      {failed ? (
        <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <p>Tickets keep using {appliedName(view)}. Fix the Dockerfile and save again.</p>
          {view.error ? <pre className="whitespace-pre-wrap font-mono">{view.error}</pre> : null}
        </div>
      ) : null}
      {view.output === '' ? null : (
        <details open={isBuilding(view) || failed}>
          <summary className="cursor-pointer text-xs text-zinc-500">Build log</summary>
          <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-zinc-950 p-2 font-mono text-xs whitespace-pre-wrap text-zinc-100">
            {view.output}
          </pre>
        </details>
      )}
    </div>
  );
}

/** While the image's state is read: its badge and what runs, the choice, the Dockerfile. */
export function AgentImageLoading(): ReactElement {
  return (
    <Loading label="Reading the agent image" className="space-y-3">
      <div className="flex items-center gap-2">
        <Bone className="h-5 w-24 rounded-full" />
        <Bone width="40%" />
      </div>
      <Bone className="h-8 w-72 rounded-lg" />
      <Bone className="h-48 rounded-lg" />
    </Loading>
  );
}
