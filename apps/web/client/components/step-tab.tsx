// The ticket panel tab for one step: its output, verdict, answer form and review bar.
import type { Step, StepOutput } from '@union/core';
import { useState, type ReactElement, type ReactNode } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { findingsOf, parseVerdict } from '../lib/verdict';
import { AnswerForm, useAnswers, type Answers } from './answer-form';
import { Markdown } from './markdown';
import { ReviewBar } from './review-bar';
import { StepNotices } from './step-notices';
import { Badge } from './ui';
import { VerdictBadge } from './verdict-badge';

const VALIDATION_TONE = { pending: 'amber', approved: 'green', revise: 'neutral' } as const;
const VALIDATION_LABEL = {
  pending: 'awaiting review',
  approved: 'approved',
  revise: 'revision requested',
} as const;

function VersionBar({
  versions,
  shown,
  onPick,
}: {
  versions: StepOutput[];
  shown: StepOutput;
  onPick: (version: number) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={VALIDATION_TONE[shown.validation]}>{VALIDATION_LABEL[shown.validation]}</Badge>
      {versions.length > 1 ? (
        <select
          className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          value={shown.version}
          onChange={(event) => {
            onPick(Number(event.target.value));
          }}
        >
          {versions.map((output) => (
            <option key={output.version} value={output.version}>
              v{output.version}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function FeedbackNote({ feedback }: { feedback: string | null }): ReactElement | null {
  return feedback ? (
    <p className="rounded-md bg-zinc-100 p-2 text-sm dark:bg-zinc-900">
      <strong>Feedback on this version:</strong> {feedback}
    </p>
  ) : null;
}

function Notice({ tone, children }: { tone: 'blue' | 'zinc'; children: ReactNode }): ReactElement {
  const color = tone === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500';
  return <p className={`text-sm ${color}`}>{children}</p>;
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
}): ReactElement {
  const { phase } = detail.ticket;
  const awaiting = phase.kind === 'awaiting_approval' && phase.step === step;
  return (
    <>
      <FeedbackNote feedback={shown?.feedback ?? null} />
      {awaiting && latest && shown === latest ? (
        <ReviewBar
          ticketId={detail.ticket.id}
          step={step}
          content={latest.content}
          pending={pending}
          onEditing={onEditing}
        />
      ) : null}
    </>
  );
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
      {shown ? (
        <VersionBar versions={state.versions} shown={shown} onPick={state.handlePick} />
      ) : null}
      {working ? <Notice tone="blue">The agent is working… see the Log tab.</Notice> : null}
      <StepNotices detail={detail} step={step} />
      {shown ? (
        <OutputBody
          step={step}
          content={state.draft ?? shown.content}
          answerable={state.answerable}
          answers={answers}
        />
      ) : null}
      <Footer
        detail={detail}
        step={step}
        shown={shown}
        latest={state.latest}
        pending={answers.answers.length > 0 ? answers.pending : undefined}
        onEditing={state.handleEditing}
      />
      {!shown && !working ? <Notice tone="zinc">No output yet.</Notice> : null}
    </div>
  );
}

export function StepTab({ detail, step }: { detail: TicketDetail; step: Step }): ReactElement {
  const latest = detail.outputs.findLast((output) => output.step === step);
  return <StepView key={latest?.version ?? 0} detail={detail} step={step} />;
}
