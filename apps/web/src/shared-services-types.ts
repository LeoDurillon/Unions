// What the Environments tab's Shared page reads of the project's shared services.
import type { SharedStack } from '@union/core';

/** A preview on the shared services' networks: a ticket's, or a pull request's under review. */
export type SharedServicesUser =
  | { kind: 'ticket'; ticketId: number; title: string }
  | { kind: 'pull-request'; reviewId: number; number: number; title: string };

export type SharedServicesView = {
  /** As the worker last saw them; null when they never ran. */
  stack: Pick<SharedStack, 'status' | 'services' | 'error' | 'startedAt' | 'updatedAt'> | null;
  previews: SharedServicesUser[];
  /** The tickets whose agent uses them now. */
  agents: { ticketId: number; title: string }[];
  /** A restart or a stop the worker has not handled yet. */
  pending: 'restart' | 'stop' | null;
  /** Why each action cannot be asked for now; null when it can. */
  refusals: { restart: string | null; stop: string | null };
};
