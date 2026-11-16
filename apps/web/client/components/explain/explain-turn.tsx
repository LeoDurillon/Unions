// One turn of an Explain conversation: the question and what it is about, then the answer, its progress or its error.

import type { ExplainLines, ExplainSubject } from '@union/core';
import { subjectLabel } from '@union/core/explain-subjects';
import type { ReactElement } from 'react';

import type { ExplanationView } from '../../../src/routes/review/explanation-views';
import type { Selection } from '../../lib/review/diff-selection';
import { AnswerCard, QuestionBubble } from '../ui/conversation-parts';
import { Badge, Button } from '../ui/ui';
import type { ExplainState } from './explain-context';
import { ExplanationAnswer } from './explanation-answer';
import { ExplanationProgress } from './explanation-progress';

/** Opens the Diff tab on lines of a file, with a comment to start on them. */
export type OpenAt = (path: string, at: Selection, draft?: string) => void;

/** What the bubble says when only subjects were given: the agent got its own question for them. */
const ASKED_WITHOUT_QUESTION = 'Explain how it works, and why the change has it.';

function firstLines(turn: ExplanationView): ExplainLines | undefined {
  return turn.subjects.find((subject): subject is ExplainLines => subject.kind === 'lines');
}

function quoted(turn: ExplanationView): string {
  const text = turn.result?.explanation ?? '';
  return `${text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')}\n\n`;
}

function Chip({ subject, openAt }: { subject: ExplainSubject; openAt: OpenAt }): ReactElement {
  const label = subjectLabel(subject);
  if (subject.kind === 'change') {
    return <span className="rounded bg-white/70 px-1.5 py-0.5 dark:bg-zinc-900/60">{label}</span>;
  }
  const at: Selection = subject.kind === 'lines' ? subject : { side: 'new', start: 1, end: 1 };
  return (
    <button
      type="button"
      title={`Open ${label} in the diff`}
      className="rounded bg-white/70 px-1.5 py-0.5 break-all text-indigo-700 hover:underline dark:bg-zinc-900/60 dark:text-indigo-300"
      onClick={() => {
        openAt(subject.path, at);
      }}
    >
      {label}
    </button>
  );
}

function Subjects({
  turn,
  openAt,
}: {
  turn: ExplanationView;
  openAt: OpenAt;
}): ReactElement | null {
  if (turn.subjects.length === 0) {
    return null;
  }
  return (
    <p className="mt-2 flex flex-wrap gap-1 font-mono text-[11px]">
      {turn.subjects.map((subject) => (
        <Chip key={JSON.stringify(subject)} subject={subject} openAt={openAt} />
      ))}
    </p>
  );
}

function SpecParts({ turn }: { turn: ExplanationView }): ReactElement | null {
  if (turn.specParts.length === 0) {
    return null;
  }
  return (
    <p className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-zinc-500">Spec parts:</span>
      {turn.specParts.map((part) => (
        <Badge key={part.key} tone="blue" title={part.spec}>
          {part.title}
        </Badge>
      ))}
      {turn.partsOutdated ? (
        <span className="text-amber-700 dark:text-amber-400">(older grouping)</span>
      ) : null}
    </p>
  );
}

type TurnProps = {
  turn: ExplanationView;
  /** "1", "2"… once the conversation has several turns; empty for one. */
  number: string;
  explain: ExplainState;
  paths: ReadonlySet<string>;
  openAt: OpenAt;
  cancel: { pending: boolean; run: (id: number) => void };
  /** Asks the same again, when the answer read another commit; null while a turn waits. */
  onAgain: (() => void) | null;
};

function Answer({ turn, explain, paths, openAt, cancel }: TurnProps): ReactElement {
  if (turn.status === 'queued' || turn.status === 'running') {
    return (
      <ExplanationProgress
        target={explain.target}
        explanation={turn}
        cancelling={cancel.pending}
        onCancel={() => {
          cancel.run(turn.id);
        }}
      />
    );
  }
  if (turn.status === 'failed') {
    return (
      <p className="text-sm whitespace-pre-wrap text-red-600 dark:text-red-400">{turn.error}</p>
    );
  }
  if (!turn.result) {
    return (
      <p className="text-sm text-zinc-500">
        {turn.status === 'cancelled' ? 'Cancelled.' : 'No answer.'}
      </p>
    );
  }
  return (
    <ExplanationAnswer
      result={turn.result}
      paths={paths}
      onOpen={(citation) => {
        openAt(citation.path, { side: 'new', start: citation.line, end: citation.line });
      }}
    />
  );
}

/** Under an answer: Outdated with Ask again, and Copy as comment on its first lines. */
function Footer({ turn, openAt, onAgain }: TurnProps): ReactElement | null {
  const lines = turn.status === 'succeeded' ? firstLines(turn) : undefined;
  if (!turn.outdated && !lines) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      {turn.outdated ? <Badge tone="amber">Outdated</Badge> : null}
      {turn.outdated && onAgain ? (
        <Button size="sm" onClick={onAgain}>
          Ask again
        </Button>
      ) : null}
      {lines ? (
        <Button
          size="sm"
          title="Start a comment on these lines with the answer quoted"
          onClick={() => {
            openAt(lines.path, lines, quoted(turn));
          }}
        >
          Copy as comment
        </Button>
      ) : null}
    </div>
  );
}

export function ExplainTurn(props: TurnProps): ReactElement {
  const { turn, number, openAt } = props;
  return (
    <div className="space-y-4">
      <QuestionBubble
        label={number === '' ? 'You' : `You · question ${number}`}
        text={turn.question ?? ASKED_WITHOUT_QUESTION}
      >
        <Subjects turn={turn} openAt={openAt} />
      </QuestionBubble>
      <AnswerCard label={number === '' ? 'Answer' : `Answer ${number}`}>
        <div className="space-y-2">
          <SpecParts turn={turn} />
          <Answer {...props} />
        </div>
        <Footer {...props} />
      </AnswerCard>
    </div>
  );
}
