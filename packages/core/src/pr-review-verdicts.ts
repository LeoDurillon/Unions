// What a review posted on GitHub says of the pull request: a comment, an approval, or a request for changes.

export const reviewVerdicts = ['comment', 'approve', 'request_changes'] as const;

export type ReviewVerdict = (typeof reviewVerdicts)[number];

export function isReviewVerdict(value: unknown): value is ReviewVerdict {
  return reviewVerdicts.some((verdict) => verdict === value);
}

/**
 * An approval may be posted alone; a comment or a request for changes needs something to say (GitHub
 * refuses them empty).
 */
export function verdictNeedsText(verdict: ReviewVerdict): boolean {
  return verdict !== 'approve';
}
