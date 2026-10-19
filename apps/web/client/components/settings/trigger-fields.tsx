// The "When" of an event rule: what triggers it, and the column, step or verdict some triggers need.
import {
  BOARD_LABELS,
  TRIGGER_KINDS,
  TRIGGER_LABELS,
  VERDICT_LABELS,
  type EventTrigger,
} from '@union/core/event-rules';
import { reviewVerdicts, type ReviewVerdict } from '@union/core/pr-review-verdicts';
import { BOARD_STATUSES, PLANNING_STEPS } from '@union/core/states';
import type { ReactElement } from 'react';

import { STEP_TITLES } from '../../lib/labels';
import { Field, inputClass } from '../ui';

const APPROVAL_STEPS = [...PLANNING_STEPS, 'implement', 'final_review'] as const;

function triggerOf(kind: EventTrigger['kind']): EventTrigger {
  if (kind === 'board_status') {
    return { kind, status: 'done' };
  }
  if (kind === 'awaiting_approval') {
    return { kind, step: null };
  }
  if (kind === 'pull_request_reviewed') {
    return { kind, verdict: 'approve' };
  }
  return { kind };
}

/** Which verdict a posted review must have; the rule's actions on a ticket skip a pull request without one. */
function VerdictSelect({
  verdict,
  onChange,
}: {
  verdict: ReviewVerdict | null;
  onChange: (trigger: EventTrigger) => void;
}): ReactElement {
  return (
    <>
      <select
        aria-label="Verdict"
        className={inputClass}
        value={verdict ?? ''}
        onChange={(event) => {
          const picked = reviewVerdicts.find((candidate) => candidate === event.target.value);
          onChange({ kind: 'pull_request_reviewed', verdict: picked ?? null });
        }}
      >
        <option value="">Any verdict</option>
        {reviewVerdicts.map((candidate) => (
          <option key={candidate} value={candidate}>
            {VERDICT_LABELS[candidate]}
          </option>
        ))}
      </select>
      <p className="text-xs text-zinc-500">
        From the review panel. Notion sets the page linked in the review&apos;s Description tab,
        else the page of the ticket with this pull request; other actions need that ticket.
      </p>
    </>
  );
}

/** The column, step or verdict some triggers need. */
function TriggerDetail({
  trigger,
  onChange,
}: {
  trigger: EventTrigger;
  onChange: (trigger: EventTrigger) => void;
}): ReactElement | null {
  return (
    <>
      {trigger.kind === 'board_status' ? (
        <select
          aria-label="Board column"
          className={inputClass}
          value={trigger.status}
          onChange={(event) => {
            const status = BOARD_STATUSES.find((candidate) => candidate === event.target.value);
            if (status) {
              onChange({ kind: 'board_status', status });
            }
          }}
        >
          {BOARD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {BOARD_LABELS[status]}
            </option>
          ))}
        </select>
      ) : null}
      {trigger.kind === 'awaiting_approval' ? (
        <select
          aria-label="Step"
          className={inputClass}
          value={trigger.step ?? ''}
          onChange={(event) => {
            const step = APPROVAL_STEPS.find((candidate) => candidate === event.target.value);
            onChange({ kind: 'awaiting_approval', step: step ?? null });
          }}
        >
          <option value="">Any step</option>
          {APPROVAL_STEPS.map((step) => (
            <option key={step} value={step}>
              {STEP_TITLES[step]}
            </option>
          ))}
        </select>
      ) : null}
      {trigger.kind === 'pull_request_reviewed' ? (
        <VerdictSelect verdict={trigger.verdict} onChange={onChange} />
      ) : null}
    </>
  );
}

export function TriggerFields({
  trigger,
  onChange,
}: {
  trigger: EventTrigger;
  onChange: (trigger: EventTrigger) => void;
}): ReactElement {
  return (
    <Field label="When">
      <select
        className={inputClass}
        value={trigger.kind}
        onChange={(event) => {
          const kind = TRIGGER_KINDS.find((candidate) => candidate === event.target.value);
          if (kind) {
            onChange(triggerOf(kind));
          }
        }}
      >
        {TRIGGER_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {TRIGGER_LABELS[kind]}
          </option>
        ))}
      </select>
      <TriggerDetail trigger={trigger} onChange={onChange} />
    </Field>
  );
}
