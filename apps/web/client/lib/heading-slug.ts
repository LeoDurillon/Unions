// The id GitHub gives a Markdown heading, so the guide's `page.md#heading` links land on it.

/** Lower case, punctuation dropped, spaces as dashes: `Review a ticket's branch` → `review-a-tickets-branch`. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s_-]/gu, '')
    .replaceAll(/\s/gu, '-');
}
