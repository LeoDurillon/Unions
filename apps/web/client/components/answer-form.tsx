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

/** The output with an input box in place of each `Answer:` line. */
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
            <input
              className={inputClass}
              aria-label={`Answer ${segment.slot + 1}`}
              placeholder="Your answer…"
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
