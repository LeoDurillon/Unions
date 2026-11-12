// Where a specification can come from: the ticket's text, the PR's description, an issue, a Notion page, a Jira issue.

export const SPEC_SOURCES = ['pr', 'ticket', 'issue', 'notion', 'jira'] as const;
export type SpecSource = (typeof SPEC_SOURCES)[number];
