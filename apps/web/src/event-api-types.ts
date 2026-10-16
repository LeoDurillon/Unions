import type { CommentTarget, EventRule, NotionSchema } from '@union/core';

/** The Events settings: the rules, and the Notion columns they can set (null until read). */
export type EventRulesResponse = {
  rules: EventRule[];
  notion: NotionSchema | null;
  hasNotion: boolean;
};

/** A rule applied to an event, with what the settings list shows beside it. */
export type DeliveryView = {
  id: number;
  ruleId: number;
  ruleName: string;
  ticketId: number | null;
  ticketTitle: string | null;
  eventType: string;
  status: 'pending' | 'succeeded' | 'failed' | 'skipped';
  attempts: number;
  detail: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
};

/** What a rule would send for a ticket, without sending it. */
export type RulePreview =
  | {
      ok: true;
      kind: 'notion_property';
      pageId: string;
      /** Each property the rule sets, with its value as the user reads it and as Notion takes it. */
      properties: { name: string; text: string; value: unknown }[];
    }
  | { ok: true; kind: 'github_comment'; on: CommentTarget; number: number; text: string }
  | { ok: true; kind: 'union_notification'; title: string; text: string }
  /** `changes`: what each change would do, its templates filled in. */
  | { ok: true; kind: 'github_pull_request'; number: number; changes: string[] }
  | { ok: false; error: string };

/** What a pull request rule can pick: the repository's label names and assignable logins. */
export type RuleChoices = { labels: string[]; users: string[] };
