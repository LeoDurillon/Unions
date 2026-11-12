// An investigation as a conversation, oldest first: each question in a bubble, each answer in a card (the latest
// one whole, or why there is none yet), then the box that asks a follow-up.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import { useState, type ReactElement, type ReactNode, type SubmitEvent } from 'react';

import { api } from '../../lib/api';
import { Markdown } from '../markdown';
import { Button, ErrorText } from '../ui';
import { isActive } from './investigation-labels';

/** Longer answers before the latest start folded, so the conversation stays easy to scan. */
const FOLD_ANSWER_AT = 1500;
/** A long question starts folded to its first lines. */
const FOLD_QUESTION_AT = 400;

function Folded({
  text,
  at,
  children,
}: {
  text: string;
  at: number;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const long = text.length > at;
  return (
    <div>
      <div
        className={
          long && !open
            ? 'max-h-40 overflow-hidden [mask-image:linear-gradient(black_70%,transparent)]'
            : ''
        }
      >
        {children}
      </div>
      {long ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show all'}
        </button>
      ) : null}
    </div>
  );
}

function QuestionBubble({ label, text }: { label: string; text: string }): ReactElement {
  return (
    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-indigo-50 px-4 py-3 text-[13.5px] dark:bg-indigo-950/50">
      <p className="mb-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">{label}</p>
      <Folded text={text} at={FOLD_QUESTION_AT}>
        <p className="whitespace-pre-wrap">{text}</p>
      </Folded>
    </div>
  );
}

function AnswerCard({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <article className="ticket-prose rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-1 text-[11px] font-semibold text-zinc-500">{label}</p>
      {children}
    </article>
  );
}

/** The latest answer: whole; the error; the agent still working (its Log follows it); or none. */
function LatestAnswer({
  investigation,
  onLog,
}: {
  investigation: Investigation;
  onLog: () => void;
}): ReactElement {
  if (investigation.error !== null) {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm whitespace-pre-wrap text-red-800 dark:bg-red-950/40 dark:text-red-300">
        {investigation.error}
      </p>
    );
  }
  if (investigation.result !== null) {
    return <Markdown>{investigation.result}</Markdown>;
  }
  if (isActive(investigation.status)) {
    return (
      <p className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
        <span className="size-2 animate-pulse rounded-full bg-blue-500" />
        The agent is working.
        <button type="button" className="font-medium underline" onClick={onLog}>
          Follow it in the Log
        </button>
      </p>
    );
  }
  return <p className="text-sm text-zinc-500">No answer.</p>;
}

/** Every question with its answer, oldest first; the labels number them once there are several. */
export function Conversation({
  investigation,
  onLog,
}: {
  investigation: Investigation;
  onLog: () => void;
}): ReactElement {
  const { history } = investigation;
  const several = history.length > 0;
  return (
    <div className="space-y-4">
      {history.map((exchange, index) => (
        // The history only grows, so the position is a stable key.
        // oxlint-disable-next-line react/no-array-index-key
        <div key={index} className="space-y-4">
          <QuestionBubble label={`You · question ${index + 1}`} text={exchange.prompt} />
          <AnswerCard label={`Answer ${index + 1}`}>
            <Folded text={exchange.answer} at={FOLD_ANSWER_AT}>
              <Markdown>{exchange.answer}</Markdown>
            </Folded>
          </AnswerCard>
        </div>
      ))}
      <QuestionBubble
        label={several ? `You · question ${history.length + 1}` : 'You'}
        text={investigation.prompt}
      />
      <AnswerCard label={several ? `Answer ${history.length + 1}` : 'Answer'}>
        <LatestAnswer investigation={investigation} onLog={onLog} />
      </AnswerCard>
    </div>
  );
}

/** Asks the agent more about an answered investigation; it gets the earlier exchanges as context. */
export function FollowUpForm({ investigation }: { investigation: Investigation }): ReactElement {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const ask = useMutation({
    mutationFn: () => api.askFollowUp(investigation, prompt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['investigations'] }),
  });
  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    ask.mutate();
  };
  return (
    <form className="space-y-1.5" onSubmit={handleSubmit}>
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-2 focus-within:border-indigo-400 focus-within:ring-3 focus-within:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900">
        <textarea
          aria-label="Ask a follow-up"
          rows={2}
          placeholder="Ask a follow-up: the agent gets the earlier questions and answers"
          className="min-h-12 flex-1 resize-y bg-transparent px-2 py-1.5 text-[13.5px] outline-none"
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
        />
        <Button type="submit" variant="primary" disabled={prompt.trim() === '' || ask.isPending}>
          Ask
        </Button>
      </div>
      <p className="px-2 text-xs text-zinc-500">
        With the repository scope, the agent reads a fresh clone.
      </p>
      <ErrorText error={ask.error} />
    </form>
  );
}
