// An investigation as a conversation, oldest first: questions in bubbles, answers in cards, then
// the follow-up box. The latest answer shows whole, or why there is none yet.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import { useState, type ReactElement, type SubmitEvent } from 'react';

import { api } from '../../lib/app/api';
import { onModEnter } from '../../lib/ui/mod-enter';
import { Markdown } from '../markdown/markdown';
import { AnswerCard, Folded, QuestionBubble } from '../ui/conversation-parts';
import { Button, ErrorText } from '../ui/ui';
import { isActive } from './investigation-labels';

/** Longer answers before the latest start folded, so the conversation stays easy to scan. */
const FOLD_ANSWER_AT = 1500;

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
  const canAsk = prompt.trim() !== '' && !ask.isPending;
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
          onKeyDown={onModEnter(() => {
            ask.mutate();
          }, canAsk)}
        />
        <Button type="submit" variant="primary" disabled={!canAsk}>
          {ask.isPending ? 'Asking…' : 'Ask'}
        </Button>
      </div>
      <p className="px-2 text-xs text-zinc-500">
        With the repository scope, the agent reads a fresh clone.
      </p>
      <ErrorText error={ask.error} />
    </form>
  );
}
