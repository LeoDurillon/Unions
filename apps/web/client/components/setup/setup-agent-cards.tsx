// The setup proposal's tickets to create, and its questions, answered in a follow-up that asks for the proposal again.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Investigation, SetupTicket } from '@union/core';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { setupFollowUp } from '../../lib/setup-follow-up';
import { Badge, Button, ErrorText, inputClass } from '../ui';

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
    <li className="space-y-1">
      <div className="flex items-start justify-between gap-3">
        <details className="min-w-0 text-xs">
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
      className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
    >
      <h3 className="font-semibold">Changes the repository needs</h3>
      <p className="text-xs text-zinc-500">
        Create a ticket for each one you want: it lands in the Backlog.
      </p>
      <ul className="space-y-2">
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
      className="space-y-2 rounded-lg border border-amber-200 p-3 text-sm dark:border-amber-900"
    >
      <h3 className="font-semibold">The agent&apos;s questions</h3>
      {questions.map((question, index) => (
        <label key={question} className="block space-y-1">
          <span className="text-xs">{question}</span>
          <textarea
            className={`${inputClass} h-14 text-xs`}
            value={answers[index] ?? ''}
            onChange={(event) => {
              setAnswers(answers.map((answer, at) => (at === index ? event.target.value : answer)));
            }}
          />
        </label>
      ))}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
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
