// One command run in a workspace, on one line: its exit, its command, how long; its output opens below.
import type { ContainerRun } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import type { Tone } from '../lib/labels';
import { stripAnsi } from '../lib/strip-ansi';
import { AgentState } from './run-agent-actions';
import { Badge, Button } from './ui';

const STATUS: Record<ContainerRun['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Waiting', tone: 'neutral' },
  running: { label: 'Running…', tone: 'blue' },
  succeeded: { label: 'Exit 0', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
/** What the shell's usual exit codes mean, on the badge's title. */
const EXIT_MEANINGS: Record<number, string> = {
  126: 'The command cannot be run (not executable)',
  127: 'Command not found',
  130: 'Interrupted',
  137: 'Killed (out of memory, or stopped)',
  143: 'Stopped',
};
const MS_PER_SEC = 1000;

function duration(run: ContainerRun): string | null {
  if (run.startedAt === null) {
    return null;
  }
  const seconds = ((run.finishedAt ?? Date.now()) - run.startedAt) / MS_PER_SEC;
  return `${seconds.toFixed(1)} s`;
}

function RunBadge({ run }: { run: ContainerRun }): ReactElement {
  const exit = run.status === 'failed' ? run.exitCode : null;
  return (
    <Badge tone={STATUS[run.status].tone} title={exit === null ? undefined : EXIT_MEANINGS[exit]}>
      {exit === null ? STATUS[run.status].label : `Exit ${exit}`}
    </Badge>
  );
}

/** The run's line: a button that opens its output, then Run again or Cancel. */
function RunLine({
  run,
  open,
  onToggle,
  onCancel,
  onAgain,
}: {
  run: ContainerRun;
  open: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onAgain: () => void;
}): ReactElement {
  const on = run.status === 'queued' || run.status === 'running';
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
        onClick={onToggle}
      >
        <span className="w-3 shrink-0 text-zinc-500">{open ? '▾' : '▸'}</span>
        <RunBadge run={run} />
        {run.scriptName === null ? null : <Badge tone="neutral">{run.scriptName}</Badge>}
        <code className="min-w-0 flex-1 truncate" title={run.command}>
          $ {run.command}
        </code>
        <AgentState forAgent={run.forAgent} />
        <span className="shrink-0 text-zinc-500 tabular-nums">{duration(run)}</span>
      </button>
      {on ? (
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <Button size="sm" variant="ghost" title="Run again" onClick={onAgain}>
          ↻ Again
        </Button>
      )}
    </div>
  );
}

/**
 * One command run in a workspace, on one line: its exit, its command, how long. Open, it shows its
 * output and what can be done with it (`children`).
 */
export function RunItem({
  run,
  open,
  onToggle,
  onCancel,
  onAgain,
  children,
}: {
  run: ContainerRun;
  open: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onAgain: () => void;
  /** What can be done with the output. */
  children?: ReactNode;
}): ReactElement {
  return (
    <li className="space-y-1 text-xs">
      <RunLine run={run} open={open} onToggle={onToggle} onCancel={onCancel} onAgain={onAgain} />
      {run.error ? <p className="pl-6 text-red-600 dark:text-red-400">{run.error}</p> : null}
      {open ? (
        <div className="space-y-1 pl-6">
          {run.command.includes('\n') ? (
            <code className="block whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
              {run.command}
            </code>
          ) : null}
          <pre className="max-h-72 overflow-auto rounded-md bg-zinc-950 p-2 whitespace-pre-wrap text-zinc-100">
            {run.output === '' ? 'No output.' : stripAnsi(run.output)}
          </pre>
          {children}
        </div>
      ) : null}
    </li>
  );
}
