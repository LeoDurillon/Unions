// Starting backlog tickets from the board: shown In progress at once ("Starting…"). A refused one
// goes back to Backlog with the error.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { TicketSummary } from '../../src/api-types';
import { api } from './api';

export type StartState = {
  /** Tickets whose start was sent and not yet seen running. */
  starting: ReadonlySet<number>;
  /** Why a ticket's last start was refused. */
  failures: ReadonlyMap<number, string>;
  start: (ticketId: number) => void;
};

function without<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

function withoutKey<K, V>(map: ReadonlyMap<K, V>, key: K): Map<K, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

/**
 * Starts tickets. A started one stays "starting" until the board's list was read again, so its card
 * never flickers back to Backlog before the worker's state arrives.
 */
export function useStartTickets(): StartState {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState<ReadonlySet<number>>(new Set());
  const [failures, setFailures] = useState<ReadonlyMap<number, string>>(new Map());
  const send = async (ticketId: number): Promise<void> => {
    try {
      await api.command(ticketId, 'start');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFailures((current) => new Map(current).set(ticketId, message));
    }
    try {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    } finally {
      setStarting((current) => without(current, ticketId));
    }
  };
  const start = (ticketId: number): void => {
    setStarting((current) => new Set(current).add(ticketId));
    setFailures((current) => withoutKey(current, ticketId));
    void send(ticketId);
  };
  return { starting, failures, start };
}

/** The tickets as the board shows them: those being started already In progress. */
export function asStarted(
  tickets: TicketSummary[],
  starting: ReadonlySet<number>,
): TicketSummary[] {
  return tickets.map((ticket) =>
    starting.has(ticket.id) && ticket.board === 'backlog'
      ? { ...ticket, board: 'in_progress' }
      : ticket,
  );
}
