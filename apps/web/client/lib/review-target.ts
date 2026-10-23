// Where the target's diff, comments and send live; also the root of its query keys.
/**
 * What a review page reviews: a ticket's branch (with `slice`, one slice's own change of a split
 * ticket), or a pull request from the Current reviews tab.
 */
export type ReviewTarget =
  | { kind: 'ticket'; ticketId: number; slice?: number }
  | { kind: 'pull-request'; projectId: number; number: number };

export function ticketReviewBase(ticketId: number): string {
  return `/api/tickets/${ticketId}`;
}

/** Where the target's diff, comments and send live; also the root of its query keys. */
export function reviewBase(target: ReviewTarget): string {
  return target.kind === 'ticket'
    ? ticketReviewBase(target.ticketId)
    : `/api/projects/${target.projectId}/pull-requests/reviews/${target.number}`;
}

/** What the review page says, and does after sending, for each kind of target. */
export type ReviewCopy = {
  /** After "N comment(s)": where they go. */
  destination: string;
  /** The button that sends them. */
  action: string;
  /** Next to the disabled Send button. */
  blocked: string;
  empty: string;
  closeOnSend: boolean;
  /** Sending can approve or request changes (GitHub), besides commenting. */
  verdicts: boolean;
};

export function reviewCopy(target: ReviewTarget): ReviewCopy {
  if (target.kind === 'ticket') {
    return {
      destination: 'go to the implementation agent as a change request.',
      action: 'Send to the implementer',
      blocked:
        'Sending opens when the ticket waits on you at the implementation or the final review, or once it is done.',
      empty: 'No changes yet: the diff appears after the implementation runs.',
      closeOnSend: true,
      verdicts: false,
    };
  }
  return {
    destination: `will be posted on #${target.number} as one GitHub review.`,
    action: 'Comment',
    blocked: 'The review is being posted on GitHub.',
    empty: 'This pull request changes no files.',
    closeOnSend: false,
    verdicts: true,
  };
}

/** The slice of a split ticket the page shows; null for its whole change, or a pull request. */
export function reviewSlice(target: ReviewTarget): number | null {
  return target.kind === 'ticket' ? (target.slice ?? null) : null;
}
