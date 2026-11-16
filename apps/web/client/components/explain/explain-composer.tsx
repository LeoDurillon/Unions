// The box under an Explain conversation (or a new one): a question for the agent, sent with Ask or Ctrl+Enter.

import { useState, type ReactElement, type SubmitEvent } from 'react';

import { onModEnter } from '../../lib/ui/mod-enter';
import { Button, ErrorText } from '../ui/ui';
import type { ExplainState } from './explain-context';

/** The box is taller for a new conversation's first question. */
const ROWS = { fresh: 4, followUp: 2 };

function hintOf(waiting: boolean): string {
  return waiting
    ? 'Ask more once the agent has answered.'
    : 'To ask about code, select lines in the Diff tab and click Explain. Each question is one agent run on your Claude usage.';
}

export function ExplainComposer({
  explain,
  conversationId,
  waiting,
}: {
  explain: ExplainState;
  /** Null: the question starts a new conversation. */
  conversationId: number | null;
  /** The conversation's last question still waits for its answer. */
  waiting: boolean;
}): ReactElement {
  const [question, setQuestion] = useState('');
  const canAsk = question.trim() !== '' && !waiting && !explain.pending;
  const send = (): void => {
    explain.ask(
      {
        ...(conversationId === null ? {} : { conversationId }),
        subjects: [],
        question: question.trim(),
      },
      () => {
        setQuestion('');
      },
    );
  };
  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (canAsk) {
      send();
    }
  };
  const fresh = conversationId === null;
  return (
    <form className="space-y-1.5" onSubmit={handleSubmit}>
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-2 focus-within:border-indigo-400 focus-within:ring-3 focus-within:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900">
        <textarea
          aria-label={fresh ? 'Ask about the change' : 'Ask a follow-up'}
          rows={fresh ? ROWS.fresh : ROWS.followUp}
          placeholder={
            fresh
              ? 'Ask about the change: how a part works, why it is there, what it relates to'
              : 'Ask a follow-up: the agent has the earlier questions and answers'
          }
          className="min-h-12 flex-1 resize-y bg-transparent px-2 py-1.5 text-[13.5px] outline-none"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          onKeyDown={onModEnter(send, canAsk)}
        />
        <Button type="submit" variant="primary" disabled={!canAsk}>
          {explain.pending ? 'Asking…' : 'Ask'}
        </Button>
      </div>
      <p className="px-2 text-xs text-zinc-500">{hintOf(waiting)}</p>
      <ErrorText error={explain.error} />
    </form>
  );
}
