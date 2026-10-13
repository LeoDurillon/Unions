import type { EventRule, NotionSchema, NotionUser } from '@union/core';
import type { EventAction, EventTrigger } from '@union/core/event-rules';

import type { DeliveryView, EventRulesResponse, RulePreview } from '../../src/event-api-types';
import { request } from './api';

export type RuleDraft = {
  name: string;
  enabled: boolean;
  trigger: EventTrigger;
  action: EventAction;
};

function base(projectId: number): string {
  return `/api/projects/${projectId}`;
}

export const eventRulesApi = {
  list: (projectId: number): Promise<EventRulesResponse> =>
    request('GET', `${base(projectId)}/event-rules`),
  create: (projectId: number, rule: RuleDraft): Promise<EventRule> =>
    request('POST', `${base(projectId)}/event-rules`, rule),
  update: (projectId: number, ruleId: number, rule: RuleDraft): Promise<EventRule> =>
    request('PUT', `${base(projectId)}/event-rules/${ruleId}`, rule),
  remove: (projectId: number, ruleId: number): Promise<unknown> =>
    request('DELETE', `${base(projectId)}/event-rules/${ruleId}`),
  preview: (projectId: number, rule: RuleDraft, ticketId: number): Promise<RulePreview> =>
    request('POST', `${base(projectId)}/event-rules/preview`, { ...rule, ticketId }),
  deliveries: (projectId: number): Promise<DeliveryView[]> =>
    request('GET', `${base(projectId)}/event-deliveries`),
  /** Reads the data source's columns from Notion again. */
  refreshNotion: (projectId: number): Promise<NotionSchema> =>
    request('POST', `${base(projectId)}/notion/schema`),
  /** The workspace members a person property can be set to. */
  notionUsers: (projectId: number): Promise<NotionUser[]> =>
    request('GET', `${base(projectId)}/notion/users`),
};
