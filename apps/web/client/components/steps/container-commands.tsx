// Commands the user runs in a workspace: a ticket's container as the agent, or a pull request's own
// checkout. They are typed or saved in the project settings and run one at a time, with the
// preview's address while it runs.

import type { ContainerRun, ProjectScript } from '@union/core';
import { useState, type ReactElement, type ReactNode } from 'react';

import type { PreviewTarget } from '../../lib/preview/preview-target';
import {
  useContainerRuns,
  type RunInput,
  type RunsView,
} from '../../lib/ticket/use-container-runs';
import { AddRunToReview } from '../pull-requests/review-run-actions';
import { ScriptButtons } from '../ticket/script-buttons';
import { Button, CARD_CLASS, ErrorText, inputClass } from '../ui/ui';
import { RunItem } from './container-run-item';
import { TicketRunActions } from './ticket-run-actions';

/** The command box grows with its lines, between these. */
const MIN_ROWS = 2;
const MAX_ROWS = 12;
/** Runs listed before "Show older". */
const SHOWN_RUNS = 5;

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

/** The runs, newest first: the newest open unless closed, the older past `SHOWN_RUNS` behind a button. */
function RunList({
  target,
  scripts,
  view,
  onCancel,
  onAgain,
}: {
  target: PreviewTarget;
  scripts: readonly ProjectScript[];
  view: RunsView;
  onCancel: (id: number) => void;
  onAgain: (input: RunInput) => void;
}): ReactElement | null {
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const [all, setAll] = useState(false);
  const shown = all ? view.runs : view.runs.slice(0, SHOWN_RUNS);
  const older = view.runs.length - shown.length;
  return (
    <>
      <ul className="space-y-1">
        {shown.map((item, index) => {
          const open = toggled[item.id] ?? index === 0;
          return (
            <RunItem
              key={item.id}
              run={item}
              open={open}
              onToggle={() => {
                setToggled({ ...toggled, [item.id]: !open });
              }}
              onCancel={() => {
                onCancel(item.id);
              }}
              onAgain={() => {
                onAgain(againInput(item, scripts));
              }}
            >
              <RunActions target={target} run={item} view={view} />
            </RunItem>
          );
        })}
      </ul>
      {older > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setAll(true);
          }}
        >
          Show {older} older
        </Button>
      ) : null}
    </>
  );
}

/** Where the commands run: in full before the first, folded once there are runs to read. */
function Intro({ intro, folded }: { intro: ReactNode; folded: boolean }): ReactElement {
  if (!folded) {
    return <p className="text-xs text-zinc-500">{intro}</p>;
  }
  return (
    <details className="text-xs text-zinc-500">
      <summary className="cursor-pointer">Where they run</summary>
      <p className="mt-1">{intro}</p>
    </details>
  );
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
    <section className={CARD_CLASS}>
      <h3 className="text-sm font-semibold">Run a command</h3>
      <Intro intro={intro} folded={(view?.runs.length ?? 0) > 0} />
      <ScriptButtons scripts={scripts} blocked={blocked} pending={run.isPending} onRun={submit} />
      <CommandForm blocked={blocked} pending={run.isPending} onRun={submit} />
      <ErrorText error={runs.error ?? run.error ?? cancel.error} />
      {view ? (
        <RunList
          target={target}
          scripts={scripts}
          view={view}
          onCancel={(id) => {
            cancel.mutate(id);
          }}
          onAgain={submit}
        />
      ) : null}
    </section>
  );
}
