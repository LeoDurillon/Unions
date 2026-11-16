// The box under an Explain conversation (or a new one): the parts gathered for it and a question, sent with Ask.

import { subjectLabel } from '@union/core/explain-subjects';
import type { ReactElement, SubmitEvent } from 'react';

import { onModEnter } from '../../lib/ui/mod-enter';
import { Button, ErrorText } from '../ui/ui';
import type { ExplainState } from './explain-context';
import type { Draft, DraftKey } from './explain-drafts';

/** The box is taller for a new conversation's first question. */
const ROWS = { fresh: 4, followUp: 2 };

function hintOf(waiting: boolean, draft: Draft): string {
  if (waiting) {
    return 'Ask once the agent has answered: what you add meanwhile waits here.';
  }
  return draft.subjects.length > 0
    ? 'Ask sends the question with these parts of the change. Each question is one agent run on your Claude usage.'
    : 'To ask about code, select lines in the Diff tab and click Explain, or ▾ to add them here. Each question is one agent run on your Claude usage.';
}

/** The subjects waiting to be sent, each with ✕, and the whole change to add. */
function DraftSubjects({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
}): ReactElement {
  const hasChange = draft.subjects.some((subject) => subject.kind === 'change');
  return (
    <div className="flex flex-wrap items-center gap-1 px-1 font-mono text-[11px]">
      {draft.subjects.map((subject, index) => {
        const label = subjectLabel(
          subject.kind === 'lines' ? { ...subject, excerpt: '' } : subject,
        );
        return (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
          >
            {label}
            <button
              type="button"
              aria-label={`Remove ${label}`}
              className="text-indigo-500 hover:text-indigo-900 dark:hover:text-indigo-100"
              onClick={() => {
                onChange({ ...draft, subjects: draft.subjects.filter((_, at) => at !== index) });
              }}
            >
              ✕
            </button>
          </span>
        );
      })}
      {hasChange ? null : (
        <button
          type="button"
          className="rounded px-1.5 py-0.5 font-sans text-xs text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950"
          onClick={() => {
            onChange({ ...draft, subjects: [...draft.subjects, { kind: 'change' }] });
          }}
        >
          + The whole change
        </button>
      )}
    </div>
  );
}

function QuestionField({
  fresh,
  value,
  onChange,
  onSend,
}: {
  fresh: boolean;
  value: string;
  onChange: (question: string) => void;
  onSend: ReturnType<typeof onModEnter>;
}): ReactElement {
  return (
    <textarea
      aria-label={fresh ? 'Ask about the change' : 'Ask a follow-up'}
      rows={fresh ? ROWS.fresh : ROWS.followUp}
      placeholder={
        fresh
          ? 'Ask about the change: how a part works, why it is there, what it relates to'
          : 'Ask a follow-up: the agent has the earlier questions and answers'
      }
      className="min-h-12 flex-1 resize-y bg-transparent px-2 py-1.5 text-[13.5px] outline-none"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onKeyDown={onSend}
    />
  );
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
  const { drafts } = explain.collect;
  const key: DraftKey = conversationId ?? 'new';
  const draft = drafts.of(key);
  const asking = draft.question.trim() !== '' || draft.subjects.length > 0;
  const canAsk = asking && !waiting && !explain.pending;
  const send = (): void => {
    explain.ask(
      {
        ...(conversationId === null ? {} : { conversationId }),
        subjects: draft.subjects,
        question: draft.question.trim() || null,
      },
      () => {
        drafts.clear(key);
      },
    );
  };
  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (canAsk) {
      send();
    }
  };
  return (
    <form className="space-y-1.5" onSubmit={handleSubmit}>
      <div className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-2 focus-within:border-indigo-400 focus-within:ring-3 focus-within:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900">
        <DraftSubjects
          draft={draft}
          onChange={(next) => {
            drafts.set(key, next);
          }}
        />
        <div className="flex items-end gap-2">
          <QuestionField
            fresh={conversationId === null}
            value={draft.question}
            onChange={(question) => {
              drafts.set(key, { ...draft, question });
            }}
            onSend={onModEnter(send, canAsk)}
          />
          <Button type="submit" variant="primary" disabled={!canAsk}>
            {explain.pending ? 'Asking…' : 'Ask'}
          </Button>
        </div>
      </div>
      <p className="px-2 text-xs text-zinc-500">{hintOf(waiting, draft)}</p>
      <ErrorText error={explain.error} />
    </form>
  );
}
