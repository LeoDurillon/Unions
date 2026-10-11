const MAX_SLUG = 40;

export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/u, '');
  return slug || 'ticket';
}

/** `<issue#>-<slug>`, or `union-<ticket id>-<slug>` while the ticket has no GitHub issue. */
export function branchName(ticket: {
  id: number;
  title: string;
  issueNumber: number | null;
}): string {
  const slug = slugify(ticket.title);
  return ticket.issueNumber === null
    ? `union-${ticket.id}-${slug}`
    : `${ticket.issueNumber}-${slug}`;
}
