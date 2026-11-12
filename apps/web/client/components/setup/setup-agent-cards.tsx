// The setup proposal's tickets to create, and its questions, answered in a follow-up that asks for the proposal again.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Investigation, SetupTicket } from '@union/core';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/app/api';
import { setupFollowUp } from '../../lib/setup/setup-follow-up';
import { Badge, Button, ErrorText, inputClass } from '../ui/ui';

function TicketRow({
  projectId,
  ticket,
  created,
  onCreated,
}: {
  projectId: number;
  ticket: SetupTicket;
  created: boolean;
  onCreated: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      api.createTicket({ projectId, title: ticket.title, body: ticket.description }),
    onSuccess: async () => {
      onCreated();
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  return (
    <li className="space-y-1 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <details className="min-w-0 text-sm">
          <summary className="cursor-pointer font-medium">{ticket.title}</summary>
          <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
            {ticket.description}
          </p>
        </details>
        {created ? (
          <Badge tone="green">Created</Badge>
        ) : (
          <Button
            size="sm"
            disabled={create.isPending}
            onClick={() => {
              create.mutate();
            }}
          >
            Create ticket
          </Button>
        )}
      </div>
      <ErrorText error={create.error} />
    </li>
  );
}

/** Changes the repository itself needs: each one a ticket in the Backlog once created. */
export function TicketsCard({
  projectId,
  tickets,
  created,
  onCreated,
}: {
  projectId: number;
  tickets: readonly SetupTicket[];
  /** Indexes of the tickets created from this proposal. */
  created: readonly number[];
  onCreated: (index: number) => void;
}): ReactElement {
  return (
    <section
      aria-label="Tickets"
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="text-[15px] font-semibold">Changes the repository needs</h3>
      <p className="text-xs text-zinc-500">
        Create a ticket for each one you want: it lands in the Backlog.
      </p>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {tickets.map((ticket, index) => (
          <TicketRow
            key={ticket.title}
            projectId={projectId}
            ticket={ticket}
            created={created.includes(index)}
            onCreated={() => {
              onCreated(index);
            }}
          />
        ))}
      </ul>
    </section>
  );
}

/** Its questions, each with a box; Ask sends the answers and the run starts again. */
export function QuestionsCard({
  investigation,
  questions,
  onAsked,
}: {
  investigation: Investigation;
  questions: readonly string[];
  onAsked: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const ask = useMutation({
    mutationFn: () => api.askFollowUp(investigation, setupFollowUp(questions, answers)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['investigations'] });
      onAsked();
    },
  });
  return (
    <section
      aria-label="Questions"
      className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30"
    >
      <h3 className="text-[15px] font-semibold">The agent&apos;s questions</h3>
      {questions.map((question, index) => (
        <label key={question} className="block space-y-1">
          <span className="text-sm font-medium">{question}</span>
          <textarea
            className={`${inputClass} h-16 bg-white text-sm dark:bg-zinc-900`}
            value={answers[index] ?? ''}
            onChange={(event) => {
              setAnswers(answers.map((answer, at) => (at === index ? event.target.value : answer)));
            }}
          />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={ask.isPending}
          onClick={() => {
            ask.mutate();
          }}
        >
          Ask the agent again
        </Button>
        <span className="text-xs text-zinc-500">
          It reads your answers and proposes everything again. Uses your Claude subscription.
        </span>
      </div>
      <ErrorText error={ask.error} />
    </section>
  );
}
