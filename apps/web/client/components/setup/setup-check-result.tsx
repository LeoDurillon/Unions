// Union's check of a setup card's values: where it is or how it ended, its output, Test again, Ask the agent to fix.

import type { Investigation, SetupCheck } from '@union/core';
import type { ReactElement } from 'react';

import type { SetupTestRequest } from '../../lib/setup/setup-api';
import { setupFixFollowUp } from '../../lib/setup/setup-follow-up';
import { useSetupCheck, type SetupCheckActions } from '../../lib/setup/use-setup-check';
import { Badge, Button, ErrorText } from '../ui/ui';

type Tone = 'neutral' | 'green' | 'red' | 'amber';

const RUNNING: Record<NonNullable<SetupCheck['stage']>, string> = {
  cloning: 'cloning the repository',
  installing: 'running the install command',
  checking: 'running the check command',
  resolving: 'reading the compose file',
};

type Status = { tone: Tone; label: string; detail: string };

const ENDED: Record<'queued' | 'passed' | 'failed' | 'timed_out', Status> = {
  queued: { tone: 'neutral', label: 'Checking…', detail: 'Waiting for its turn.' },
  passed: { tone: 'green', label: 'Passed', detail: 'Union ran it on a fresh clone.' },
  failed: { tone: 'red', label: 'Failed', detail: 'Union ran it on a fresh clone.' },
  timed_out: { tone: 'amber', label: 'Timed out', detail: 'It ran out of time on a fresh clone.' },
};

function statusOf(check: SetupCheck | null): Status {
  if (!check) {
    return { tone: 'neutral', label: 'Not tested', detail: 'Test it before you apply it.' };
  }
  if (check.status === 'running') {
    const stage = RUNNING[check.stage ?? 'cloning'];
    return { tone: 'neutral', label: 'Checking…', detail: `Now ${stage}.` };
  }
  return ENDED[check.status];
}

function isBusy(check: SetupCheck | null): boolean {
  return check?.status === 'queued' || check?.status === 'running';
}

function isFailed(check: SetupCheck | null): check is SetupCheck {
  return check?.status === 'failed' || check?.status === 'timed_out';
}

function Output({ check }: { check: SetupCheck }): ReactElement | null {
  if (check.output === '') {
    return null;
  }
  const failed = check.status === 'failed' || check.status === 'timed_out';
  return (
    <details open={failed} className="text-xs">
      <summary className="cursor-pointer text-zinc-500">Output (its end)</summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-zinc-100 p-2 whitespace-pre-wrap dark:bg-zinc-950">
        {check.output}
      </pre>
    </details>
  );
}

function Buttons({
  check,
  actions,
  fixPrompt,
}: {
  check: SetupCheck | null;
  actions: SetupCheckActions;
  fixPrompt: (check: SetupCheck) => string;
}): ReactElement {
  return (
    <div className="flex gap-2">
      {isFailed(check) ? (
        <Button
          size="sm"
          disabled={actions.pending}
          title="Sends the agent this output; it proposes everything again. Uses your Claude subscription."
          onClick={() => {
            actions.fix(fixPrompt(check));
          }}
        >
          Ask the agent to fix
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={isBusy(check) || actions.pending}
        onClick={() => {
          actions.test();
        }}
      >
        {check ? 'Test again' : 'Test'}
      </Button>
    </div>
  );
}

/** `changed`: the fields no longer hold what was tested. `fixPrompt`: the follow-up for a failure. */
function SetupCheckResult({
  check,
  actions,
  changed,
  fixPrompt,
}: {
  check: SetupCheck | null;
  actions: SetupCheckActions;
  changed: boolean;
  fixPrompt: (check: SetupCheck) => string;
}): ReactElement {
  const { tone, label, detail } = statusOf(check);
  const note =
    changed && !isBusy(check) ? ' You changed the values since: Test again checks them.' : '';
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm">
          <Badge tone={tone}>{label}</Badge>
          <span className="text-zinc-500">
            {detail}
            {note}
          </span>
        </p>
        <Buttons check={check} actions={actions} fixPrompt={fixPrompt} />
      </div>
      {check ? <Output check={check} /> : null}
      <ErrorText error={actions.error} />
    </div>
  );
}

/** What was tested, as the agent reads it in a fix request. */
function testedText(values: SetupTestRequest): string {
  if (values.kind === 'checks') {
    return `Install command: ${values.installCommand.trim()}\nCheck command: ${values.gateCommand.trim()}`;
  }
  const { composeFile, composeAdditions } = values.preview;
  return composeAdditions
    ? `Compose file: ${composeFile}\nCompose additions:\n${composeAdditions}`
    : `Compose file: ${composeFile}`;
}

/** Whether the fields hold other values than the check ran with (only the fields a card edits). */
function differs(check: SetupCheck | null, values: SetupTestRequest): boolean {
  const { input } = check ?? {};
  if (!input || input.kind !== values.kind) {
    return false;
  }
  return testedText(input).trim() !== testedText(values).trim();
}

/**
 * A card's check: its latest result, Test again with `values` (what its fields hold now), and Ask
 * the agent to fix, which names `what` was tested.
 */
export function SetupCheckSection({
  investigation,
  check,
  values,
  what,
}: {
  investigation: Investigation;
  check: SetupCheck | null;
  values: SetupTestRequest;
  what: string;
}): ReactElement {
  const actions = useSetupCheck(investigation, () => values);
  return (
    <SetupCheckResult
      check={check}
      actions={actions}
      changed={differs(check, values)}
      fixPrompt={(failed) => setupFixFollowUp(what, testedText(failed.input), failed.output)}
    />
  );
}
