// Where a specification can come from: the ticket's text, the PR's description, an issue, a Notion page.

export const SPEC_SOURCES = ['pr', 'ticket', 'issue', 'notion'] as const;
export type SpecSource = (typeof SPEC_SOURCES)[number];
