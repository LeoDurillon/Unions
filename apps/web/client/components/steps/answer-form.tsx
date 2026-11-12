// The output with a text box in place of each `Answer:` line; answers can take several lines.

import { useState, type ReactElement } from 'react';

import { answersOf, fillAnswers, splitAnswers, type Segment } from '../../lib/ticket/answers';
import { Markdown } from '../markdown/markdown';
import { inputClass } from '../ui/ui';

export type Answers = {
  segments: Segment[];
  answers: string[];
  /** The output with the typed answers written into its `Answer:` lines. */
  pending: string;
  setAnswer: (slot: number, value: string) => void;
};

export function useAnswers(content: string): Answers {
  const segments = splitAnswers(content);
  const [answers, setAnswers] = useState(() => answersOf(segments));
  const setAnswer = (slot: number, value: string): void => {
    setAnswers((previous) => previous.map((answer, index) => (index === slot ? value : answer)));
  };
  return { segments, answers, pending: fillAnswers(content, answers), setAnswer };
}

/** An answer box's height, in lines, before it grows with what is typed. */
const MIN_ROWS = 2;
const FULL = 100;

/** The output with a text box in place of each `Answer:` line; answers can take several lines. */
export function AnswerForm({ segments, answers, setAnswer }: Answers): ReactElement {
  const answered = answers.filter((answer) => answer.trim() !== '').length;
  const percent = answers.length === 0 ? 0 : Math.round((answered / answers.length) * FULL);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <p className="flex-1 text-xs text-zinc-500">
          Answers are saved when you approve or request a revision.
        </p>
        <span className="text-xs text-zinc-500 tabular-nums">
          <strong className="text-zinc-900 dark:text-zinc-100">{answered}</strong> /{' '}
          {answers.length} answered
        </span>
        <span className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <span
            className="block h-full rounded-full bg-indigo-600"
            style={{ width: `${percent}%` }}
          />
        </span>
      </div>
      {segments.map((segment) =>
        segment.kind === 'text' ? (
          <Markdown key={segment.key}>{segment.text}</Markdown>
        ) : (
          <div key={segment.key} className="pl-6">
            <textarea
              className={`${inputClass} resize-y rounded-lg focus:ring-3 focus:ring-indigo-500/15 ${(answers[segment.slot] ?? '').trim() === '' ? '' : 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20'}`}
              aria-label={`Answer ${segment.slot + 1}`}
              placeholder="Your answer…"
              rows={Math.max(MIN_ROWS, (answers[segment.slot] ?? '').split('\n').length)}
              value={answers[segment.slot] ?? ''}
              onChange={(event) => {
                setAnswer(segment.slot, event.target.value);
              }}
            />
          </div>
        ),
      )}
    </div>
  );
}
