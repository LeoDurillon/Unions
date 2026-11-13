// What doing a rule's action came to: done, skipped and why, failed, or to try again later.

export type DeliveryOutcome =
  | { status: 'succeeded' | 'skipped'; detail: string }
  | { status: 'failed'; error: string; detail?: string }
  /** A temporary failure: tried again later, until `MAX_ATTEMPTS` (`event-deliveries.ts`). */
  | { status: 'retry'; error: string };
