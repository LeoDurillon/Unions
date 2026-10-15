import type { ContainerRun } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { Tone } from '../lib/labels';
import { useContainerRuns } from '../lib/use-container-runs';
import { Badge, Button, ErrorText, inputClass } from './ui';

const STATUS: Record<ContainerRun['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Waiting', tone: 'neutral' },
  running: { label: 'Running…', tone: 'blue' },
  succeeded: { label: 'Exit 0', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const MS_PER_SEC = 1000;
/** The command box grows with its lines, between these. */
const MIN_ROWS = 2;
const MAX_ROWS = 12;

function duration(run: ContainerRun): string | null {
  if (run.startedAt === null) {
    return null;
  }
  const seconds = ((run.finishedAt ?? Date.now()) - run.startedAt) / MS_PER_SEC;
  return `${seconds.toFixed(1)} s`;
}

function statusLabel(run: ContainerRun): string {
  return run.status === 'failed' && run.exitCode !== null
    ? `Exit ${run.exitCode}`
    : STATUS[run.status].label;
}

function RunItem({
  run,
  latest,
  onCancel,
  onAgain,
}: {
  run: ContainerRun;
  latest: boolean;
  onCancel: () => void;
  onAgain: () => void;
}): ReactElement {
  const on = run.status === 'queued' || run.status === 'running';
  return (
    <li className="space-y-1 text-xs">
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone={STATUS[run.status].tone}>{statusLabel(run)}</Badge>
        <code className="max-h-24 min-w-0 flex-1 overflow-auto pt-0.5 whitespace-pre-wrap">
          $ {run.command}
        </code>
        <span className="text-zinc-500">{duration(run)}</span>
        {on ? (
          <Button onClick={onCancel}>Cancel</Button>
        ) : (
          <Button onClick={onAgain}>Run again</Button>
        )}
      </div>
      {run.error ? <p className="text-red-600 dark:text-red-400">{run.error}</p> : null}
      {run.output === '' ? null : (
        <details open={latest}>
          <summary className="cursor-pointer text-zinc-500">Output (last lines)</summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-zinc-950 p-2 whitespace-pre-wrap text-zinc-100">
            {run.output}
          </pre>
        </details>
      )}
    </li>
  );
}

/**
 * The command box, several lines if needed (run as one script; Ctrl+Enter runs it). Run is off
 * while the workspace cannot take a command (`blocked` says why).
 */
function CommandForm({
  blocked,
  pending,
  onRun,
}: {
  blocked: string | null;
  pending: boolean;
  onRun: (command: string) => void;
}): ReactElement {
  const [command, setCommand] = useState('');
  return (
    <form
      className="flex items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked === null && !pending) {
          onRun(command);
        }
      }}
    >
      <textarea
        aria-label="Command"
        className={`${inputClass} font-mono`}
        rows={Math.min(Math.max(command.split('\n').length, MIN_ROWS), MAX_ROWS)}
        value={command}
        placeholder={'npm run import -- fixtures/big.ifc\n(Ctrl+Enter to run)'}
        onChange={(event) => {
          setCommand(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <Button
        type="submit"
        variant="primary"
        disabled={blocked !== null || pending || command.trim() === ''}
        title={blocked ?? undefined}
      >
        Run
      </Button>
    </form>
  );
}

/**
 * Commands the user runs in the ticket's workspace: its container, in the checkout, as the agent
 * (with the preview's address while it runs). Never during a step; one at a time.
 */
export function ContainerCommands({ ticketId }: { ticketId: number }): ReactElement {
  const { runs, run, cancel, active } = useContainerRuns(ticketId);
  const blocked = runs.data?.refusal ?? (active ? 'A command is already running' : null);
  const submit = (text: string): void => {
    if (text.trim() !== '') {
      run.mutate(text);
    }
  };
  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <h3 className="text-sm font-medium">Commands</h3>
      <p className="text-xs text-zinc-500">
        Runs in the ticket&apos;s workspace, in the repository, as the agent does (no GitHub
        credentials), with <code>PREVIEW_URL</code> while the preview runs. 10 minutes at most.
      </p>
      <CommandForm blocked={blocked} pending={run.isPending} onRun={submit} />
      <ErrorText error={runs.error ?? run.error ?? cancel.error} />
      <ul className="space-y-3">
        {(runs.data?.runs ?? []).map((item, index) => (
          <RunItem
            key={item.id}
            run={item}
            latest={index === 0}
            onCancel={() => {
              cancel.mutate(item.id);
            }}
            onAgain={() => {
              submit(item.command);
            }}
          />
        ))}
      </ul>
    </section>
  );
}
