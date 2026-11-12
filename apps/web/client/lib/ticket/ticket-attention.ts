// What the ticket needs from the user now, in a sentence: a step to read or answer, a stop to look at, a start.

import type { CustomAgentNames } from '@union/core';
import { resolveFlow } from '@union/core/flows';
import type { Step } from '@union/core/states';
import { stepTitle } from '@union/core/step-titles';

import type { TicketDetail } from '../../../src/api-types';
import { isBlocked } from '../board/labels';
import { answersOf, splitAnswers } from './answers';
import { findingsOf, parseVerdict } from './verdict';

/** `review`: the final review, read with the diff; `step`: an output to read or answer; `start`: in Backlog. */
type AttentionKind = 'review' | 'step' | 'stalled' | 'start';

export type Attention = {
  kind: AttentionKind;
  tone: 'amber' | 'red' | 'neutral';
  title: string;
  detail: string | null;
  step: Step | null;
};

const LEAD_MAX = 220;

/** The first line of prose of a Markdown text, without its marks, cut to a sentence's length. */
export function leadOf(markdown: string): string | null {
  const line = markdown
    .split('\n')
    .map((text) => text.trim())
    .find((text) => text !== '' && !/^(?:#|---|\||```|VERDICT:)/u.test(text));
  if (line === undefined) {
    return null;
  }
  const plain = line
    .replaceAll(/[*_`]/gu, '')
    .replace(/^[-+] (?:\[[ x]\] )?/u, '')
    .trim();
  return plain.length > LEAD_MAX ? `${plain.slice(0, LEAD_MAX).trimEnd()}…` : plain;
}

const VERDICT_TITLES = {
  changes_requested: 'The final review requests changes',
  approved: 'The final review approves the changes',
} as const;

function awaiting(detail: TicketDetail, step: Step, names: CustomAgentNames): Attention {
  const content = detail.outputs.findLast((output) => output.step === step)?.content ?? '';
  if (step === 'final_review') {
    const verdict = parseVerdict(content);
    const title = verdict ? VERDICT_TITLES[verdict] : 'The final review is ready';
    return { kind: 'review', tone: 'amber', title, detail: leadOf(findingsOf(content)), step };
  }
  const open = answersOf(splitAnswers(content)).filter((answer) => answer.trim() === '').length;
  const name = stepTitle(step, names);
  const title =
    open > 0
      ? `${name} asks ${open} question${open === 1 ? '' : 's'}`
      : `${name} is ready for you to read`;
  return { kind: 'step', tone: 'amber', title, detail: leadOf(content), step };
}

function backlog(detail: TicketDetail, names: CustomAgentNames): Attention {
  const [first] = resolveFlow(detail.ticket, detail.project.config);
  if (isBlocked(detail.ticket)) {
    const detailText = 'It starts once the ticket it depends on is done.';
    return {
      kind: 'start',
      tone: 'neutral',
      title: 'Waits for its parent',
      detail: detailText,
      step: null,
    };
  }
  const detailText = first ? `Start runs ${stepTitle(first, names)} first.` : null;
  return {
    kind: 'start',
    tone: 'neutral',
    title: 'Ready to start',
    detail: detailText,
    step: null,
  };
}

/** What the ticket needs from the user now; null while it runs or once it ended. */
export function attentionOf(detail: TicketDetail, names: CustomAgentNames): Attention | null {
  const { phase } = detail.ticket;
  switch (phase.kind) {
    case 'backlog': {
      return backlog(detail, names);
    }
    case 'awaiting_approval': {
      return awaiting(detail, phase.step, names);
    }
    case 'failed': {
      const title = `${stepTitle(phase.step, names)} failed`;
      return { kind: 'stalled', tone: 'red', title, detail: phase.error, step: phase.step };
    }
    case 'rate_limited': {
      const detailText =
        phase.retryAt === null
          ? 'Retry once it resets.'
          : 'Union retries by itself once it resets.';
      const title = 'Claude usage limit reached';
      return { kind: 'stalled', tone: 'red', title, detail: detailText, step: phase.step };
    }
    case 'commit_refused': {
      const title = "A git hook refused the agent's commit";
      return { kind: 'stalled', tone: 'amber', title, detail: null, step: phase.step };
    }
    case 'running':
    case 'done':
    case 'cancelled': {
      return null;
    }
    default: {
      return null;
    }
  }
}
