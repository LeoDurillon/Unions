import type { EventRule, NotionSchema } from '@union/core';

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
  | { ok: true; property: string; text: string; value: unknown; pageId: string }
  | { ok: false; error: string };
