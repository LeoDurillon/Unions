// Commands the user runs in a workspace (a ticket's container as the agent, or a pull request's own
// checkout), with the preview's address while it runs, typed or saved in the project settings; one
// at a time.
import type { ContainerRun, ProjectScript } from '@union/core';
import { useState, type ReactElement, type ReactNode } from 'react';

import type { Tone } from '../lib/labels';
import type { PreviewTarget } from '../lib/preview-target';
import { useContainerRuns, type RunInput, type RunsView } from '../lib/use-container-runs';
import { AddRunToReview } from './pull-requests/review-run-actions';
import { ScriptButtons } from './script-buttons';
import { TicketRunActions } from './ticket-run-actions';
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
  children,
}: {
  run: ContainerRun;
  latest: boolean;
  onCancel: () => void;
  onAgain: () => void;
  /** What can be done with the output. */
  children?: ReactNode;
}): ReactElement {
  const on = run.status === 'queued' || run.status === 'running';
  return (
    <li className="space-y-1 text-xs">
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone={STATUS[run.status].tone}>{statusLabel(run)}</Badge>
        {run.scriptName === null ? null : <Badge tone="neutral">{run.scriptName}</Badge>}
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
      {children}
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
  onRun: (input: RunInput) => void;
}): ReactElement {
  const [command, setCommand] = useState('');
  return (
    <form
      className="flex items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked === null && !pending) {
          onRun({ command });
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

function RunActions({
  target,
  run,
  view,
}: {
  target: PreviewTarget;
  run: ContainerRun;
  view: RunsView;
}): ReactElement {
  return target.kind === 'ticket' ? (
    <TicketRunActions
      ticketId={target.ticketId}
      run={run}
      canSend={'canSend' in view && view.canSend}
    />
  ) : (
    <AddRunToReview target={target} run={run} />
  );
}

/** Runs a run again: by its script while the project still has it (with its current command). */
function againInput(run: ContainerRun, scripts: readonly ProjectScript[]): RunInput {
  return run.scriptName !== null && scripts.some((script) => script.name === run.scriptName)
    ? { scriptName: run.scriptName }
    : { command: run.command };
}

/**
 * Commands the user runs in a workspace (a ticket's container as the agent, or a pull request's own
 * checkout), with the preview's address while it runs, typed or saved in the project settings; one
 * at a time. `intro` says where they run. A ticket's output can go to the implementer, a pull
 * request's to the review as a comment.
 */
export function ContainerCommands({
  target,
  scripts,
  intro,
}: {
  target: PreviewTarget;
  scripts: readonly ProjectScript[];
  intro: ReactNode;
}): ReactElement {
  const { runs, run, cancel, active } = useContainerRuns(target);
  const blocked = runs.data?.refusal ?? (active ? 'A command is already running' : null);
  const submit = (input: RunInput): void => {
    if (!('command' in input) || input.command.trim() !== '') {
      run.mutate(input);
    }
  };
  const view = runs.data;
  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <h3 className="text-sm font-medium">Commands</h3>
      <p className="text-xs text-zinc-500">{intro}</p>
      <ScriptButtons scripts={scripts} blocked={blocked} pending={run.isPending} onRun={submit} />
      <CommandForm blocked={blocked} pending={run.isPending} onRun={submit} />
      <ErrorText error={runs.error ?? run.error ?? cancel.error} />
      <ul className="space-y-3">
        {(view?.runs ?? []).map((item, index) => (
          <RunItem
            key={item.id}
            run={item}
            latest={index === 0}
            onCancel={() => {
              cancel.mutate(item.id);
            }}
            onAgain={() => {
              submit(againInput(item, scripts));
            }}
          >
            {view ? <RunActions target={target} run={item} view={view} /> : null}
          </RunItem>
        ))}
      </ul>
    </section>
  );
}
