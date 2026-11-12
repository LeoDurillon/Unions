// One review agent's newest run on the change: its state (Cancel while it works), why it failed, or
// its answer. The answer has links to the diff, Copy and Run again.

import type { ReactElement, ReactNode } from 'react';

import type { ReviewAgentRunView } from '../../../src/routes/review/review-agent-runs';
import type { Tone } from '../../lib/board/labels';
import { isActive } from '../../lib/review/use-review-agents';
import { Markdown } from '../markdown/markdown';
import { Badge, Button } from '../ui/ui';
import { CopyMarkdownButton } from './copy-markdown-button';

const STATUS: Record<ReviewAgentRunView['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Waiting for a run slot', tone: 'blue' },
  running: { label: 'Running', tone: 'blue' },
  succeeded: { label: 'Done', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function specsLine(run: ReviewAgentRunView): string {
  return run.specs.length === 0 ? 'Read no spec.' : `Read ${run.specs.join(', ')}.`;
}

function Actions({
  run,
  busy,
  onRun,
  onCancel,
}: {
  run: ReviewAgentRunView;
  busy: boolean;
  onRun: () => void;
  onCancel: () => void;
}): ReactElement {
  if (isActive(run)) {
    return <Button onClick={onCancel}>Cancel</Button>;
  }
  return (
    <>
      {run.output === null ? null : <CopyMarkdownButton text={() => run.output ?? ''} />}
      <Button disabled={busy} onClick={onRun}>
        Run again
      </Button>
    </>
  );
}

function Body({
  run,
  renderCode,
}: {
  run: ReviewAgentRunView;
  renderCode: (text: string) => ReactNode | null;
}): ReactElement | null {
  if (isActive(run)) {
    return (
      <p className="animate-pulse text-sm text-indigo-600 dark:text-indigo-400">
        {run.status === 'queued'
          ? 'Waiting for a run slot…'
          : 'Preparing a copy of the change, then the agent reviews it…'}
      </p>
    );
  }
  if (run.status === 'failed') {
    return <p className="text-sm text-red-600 dark:text-red-400">{run.error}</p>;
  }
  return run.output === null ? null : <Markdown renderCode={renderCode}>{run.output}</Markdown>;
}

export function ReviewAgentRunCard({
  run,
  busy,
  onRun,
  onCancel,
  renderCode,
}: {
  run: ReviewAgentRunView;
  /** Another run works on the change: only one at a time. */
  busy: boolean;
  onRun: () => void;
  onCancel: () => void;
  renderCode: (text: string) => ReactNode | null;
}): ReactElement {
  const status = STATUS[run.status];
  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{run.agentName}</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
        {run.outdated ? (
          <Badge tone="amber">The change moved since: run it again for the latest</Badge>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Actions run={run} busy={busy} onRun={onRun} onCancel={onCancel} />
        </span>
      </header>
      <p className="text-xs text-zinc-500">{specsLine(run)}</p>
      <Body run={run} renderCode={renderCode} />
    </section>
  );
}
