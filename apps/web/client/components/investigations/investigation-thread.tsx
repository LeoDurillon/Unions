import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import { useState, type ReactElement, type SubmitEvent } from 'react';

import { api } from '../../lib/api';
import { Markdown } from '../markdown';
import { Button, ErrorText, inputClass } from '../ui';
import { InvestigationTicket } from './investigation-ticket';

const BOX = 'rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800';
const LABEL = 'text-xs font-medium text-zinc-500';
/** Longer answers start folded, so the conversation stays easy to scan. */
const FOLD_AT = 1500;

function FoldedAnswer({ text }: { text: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const long = text.length > FOLD_AT;
  return (
    <div>
      <div className={long && !open ? 'max-h-64 overflow-hidden' : ''}>
        <Markdown>{text}</Markdown>
      </div>
      {long ? (
        <button
          type="button"
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
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

function Question({ number, text }: { number: number | null; text: string }): ReactElement {
  return (
    <div className="space-y-1">
      <p className={LABEL}>{number === null ? 'Question' : `Question ${number}`}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

/** The questions asked before the latest one, each followed by its answer, oldest first. */
export function EarlierExchanges({
  investigation,
}: {
  investigation: Investigation;
}): ReactElement | null {
  if (investigation.history.length === 0) {
    return null;
  }
  return (
    <section className="space-y-3" aria-label="Earlier questions">
      {investigation.history.map((exchange, index) => (
        // The history only grows, so the position is a stable key.
        // oxlint-disable-next-line react/no-array-index-key
        <article key={index} className={`${BOX} space-y-3`}>
          <Question number={index + 1} text={exchange.prompt} />
          <div className="space-y-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className={LABEL}>Answer</p>
            <FoldedAnswer text={exchange.answer} />
          </div>
        </article>
      ))}
    </section>
  );
}

/** The latest question; its answer is in the Answer tab below. */
export function LatestQuestion({ investigation }: { investigation: Investigation }): ReactElement {
  const earlier = investigation.history.length;
  return (
    <div className={BOX}>
      <Question number={earlier === 0 ? null : earlier + 1} text={investigation.prompt} />
    </div>
  );
}

/** Asks the agent more about an answered investigation; it gets the earlier exchanges as context. */
function FollowUpForm({ investigation }: { investigation: Investigation }): ReactElement {
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
    <form className="space-y-2" onSubmit={handleSubmit}>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Follow-up</span>
        <span className="block text-xs text-zinc-500">
          Ask for more detail. The agent gets the earlier questions and answers; with the repository
          scope it reads a fresh clone.
        </span>
        <textarea
          className={`${inputClass} min-h-24 font-mono text-xs`}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
        />
      </label>
      <ErrorText error={ask.error} />
      <Button type="submit" variant="primary" disabled={prompt.trim() === '' || ask.isPending}>
        Ask
      </Button>
    </form>
  );
}

/** What can follow an answer: a ticket written from the investigation, or another question. */
export function NextSteps({
  investigation,
  hasNotion,
  onOpenTicket,
}: {
  investigation: Investigation;
  hasNotion: boolean;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  return (
    <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <InvestigationTicket
        investigation={investigation}
        hasNotion={hasNotion}
        onOpenTicket={onOpenTicket}
      />
      <FollowUpForm investigation={investigation} />
    </div>
  );
}
