import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import { useState, type ReactElement, type SubmitEvent } from 'react';

import { api } from '../../lib/api';
import { Markdown } from '../markdown';
import { Button, ErrorText, inputClass } from '../ui';

const BOX = 'rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800';

/** The questions asked before the latest one, each with its answer; collapsed. */
export function EarlierExchanges({
  investigation,
}: {
  investigation: Investigation;
}): ReactElement | null {
  if (investigation.history.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2" aria-label="Earlier questions">
      {investigation.history.map((exchange, index) => (
        // The history only grows, so the position is a stable key.
        // oxlint-disable-next-line react/no-array-index-key
        <details key={index} className={BOX}>
          <summary className="cursor-pointer truncate font-medium">
            {index === 0 ? 'Prompt' : `Follow-up ${index}`}
            <span className="ml-2 font-normal text-zinc-500 in-open:hidden">
              {exchange.prompt.split('\n')[0]}
            </span>
          </summary>
          <p className="mt-2 font-mono text-xs whitespace-pre-wrap">{exchange.prompt}</p>
          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <Markdown>{exchange.answer}</Markdown>
          </div>
        </details>
      ))}
    </section>
  );
}

/** The latest question: the prompt, or the newest follow-up (shown open). */
export function LatestQuestion({ investigation }: { investigation: Investigation }): ReactElement {
  const followUps = investigation.history.length;
  return (
    <details className={BOX} open={followUps > 0}>
      <summary className="cursor-pointer font-medium">
        {followUps === 0 ? 'Prompt' : `Follow-up ${followUps}`}
      </summary>
      <p className="mt-2 font-mono text-xs whitespace-pre-wrap">{investigation.prompt}</p>
    </details>
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
    <form
      className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      onSubmit={handleSubmit}
    >
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
