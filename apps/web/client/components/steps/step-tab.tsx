// The ticket panel tab for one step: its output, verdict, answer form and review bar.

import type { Step, StepOutput } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { findingsOf, parseVerdict } from '../../lib/ticket/verdict';
import { Markdown } from '../markdown/markdown';
import { AnswerForm, useAnswers, type Answers } from './answer-form';
import { ReviewBar } from './review-bar';
import { StepNotices } from './step-notices';
import { NoOutput, StepOutputCard } from './step-output-card';
import { VerdictBadge } from './verdict-badge';

/** A new version being written while an older one shows. */
function WorkingNote(): ReactElement {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
      <span aria-hidden className="size-2 animate-pulse rounded-full bg-blue-500" />
      The agent is writing a new version. The Log tab shows what it does.
    </p>
  );
}

function Footer({
  detail,
  step,
  shown,
  latest,
  pending,
  onEditing,
}: {
  detail: TicketDetail;
  step: Step;
  shown: StepOutput | undefined;
  latest: StepOutput | undefined;
  pending: string | undefined;
  onEditing: (draft: string | null) => void;
}): ReactElement | null {
  const { phase } = detail.ticket;
  const awaiting = phase.kind === 'awaiting_approval' && phase.step === step;
  return awaiting && latest && shown === latest ? (
    <ReviewBar
      ticketId={detail.ticket.id}
      step={step}
      next={detail.afterApproval}
      content={latest.content}
      pending={pending}
      onEditing={onEditing}
    />
  ) : null;
}

/** Rendered output: inputs for the `Answer:` lines while the latest version awaits review. */
function OutputBody({
  step,
  content,
  answerable,
  answers,
}: {
  step: Step;
  content: string;
  answerable: boolean;
  answers: Answers;
}): ReactElement {
  if (answerable && answers.answers.length > 0) {
    return <AnswerForm {...answers} />;
  }
  if (step !== 'final_review') {
    return <Markdown>{content}</Markdown>;
  }
  // The badge shows the verdict, so its line is not repeated in the text.
  return (
    <>
      <VerdictBadge review={content} />
      <Markdown>{parseVerdict(content) ? findingsOf(content) : content}</Markdown>
    </>
  );
}

type StepState = {
  versions: StepOutput[];
  latest: StepOutput | undefined;
  shown: StepOutput | undefined;
  working: boolean;
  answerable: boolean;
  answers: Answers;
  draft: string | null;
  handlePick: (version: number) => void;
  handleEditing: (draft: string | null) => void;
};

function useStepState(detail: TicketDetail, step: Step): StepState {
  const versions = detail.outputs.filter((output) => output.step === step);
  const latest = versions.at(-1);
  const [picked, setPicked] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const answers = useAnswers(latest?.content ?? '');
  const { phase } = detail.ticket;
  const shown = versions.find((output) => output.version === picked) ?? latest;
  const awaiting = phase.kind === 'awaiting_approval' && phase.step === step;
  return {
    versions,
    latest,
    shown,
    working: phase.kind === 'running' && phase.step === step,
    answerable: awaiting && draft === null && shown === latest,
    answers,
    draft,
    handlePick: setPicked,
    handleEditing: setDraft,
  };
}

/** Remounted (via `key`) on every new version, so picker, draft and answers reset without effects. */
function StepView({ detail, step }: { detail: TicketDetail; step: Step }): ReactElement {
  const state = useStepState(detail, step);
  const { shown, working, answers } = state;
  return (
    <div className="space-y-4">
      {working && shown ? <WorkingNote /> : null}
      <StepNotices detail={detail} step={step} />
      {shown ? (
        <StepOutputCard versions={state.versions} shown={shown} onPick={state.handlePick}>
          <OutputBody
            step={step}
            content={state.draft ?? shown.content}
            answerable={state.answerable}
            answers={answers}
          />
        </StepOutputCard>
      ) : (
        <NoOutput working={working} />
      )}
      <Footer
        detail={detail}
        step={step}
        shown={shown}
        latest={state.latest}
        pending={answers.answers.length > 0 ? answers.pending : undefined}
        onEditing={state.handleEditing}
      />
    </div>
  );
}

export function StepTab({ detail, step }: { detail: TicketDetail; step: Step }): ReactElement {
  const latest = detail.outputs.findLast((output) => output.step === step);
  return <StepView key={latest?.version ?? 0} detail={detail} step={step} />;
}
