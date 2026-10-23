// The output with a text box in place of each `Answer:` line; answers can take several lines.
import { useState, type ReactElement } from 'react';

import { answersOf, fillAnswers, splitAnswers, type Segment } from '../lib/answers';
import { Markdown } from './markdown';
import { inputClass } from './ui';

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

/** The output with a text box in place of each `Answer:` line; answers can take several lines. */
export function AnswerForm({ segments, answers, setAnswer }: Answers): ReactElement {
  const answered = answers.filter((answer) => answer.trim() !== '').length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        {answered} of {answers.length} answered. Answers are saved when you approve or request a
        revision.
      </p>
      {segments.map((segment) =>
        segment.kind === 'text' ? (
          <Markdown key={segment.key}>{segment.text}</Markdown>
        ) : (
          <div key={segment.key} className="pl-6">
            <textarea
              className={`${inputClass} resize-y`}
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
