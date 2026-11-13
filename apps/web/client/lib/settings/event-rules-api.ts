// The browser's client for the event rules endpoints.

import type { EventRule, NotionUser, ProjectField } from '@union/core';
import { emptyAction, type EventAction } from '@union/core/event-actions';
import type { EventTrigger } from '@union/core/event-rules';
import type { IntegrationKindName } from '@union/core/integration-kinds';

import type {
  DeliveryView,
  EventRulesResponse,
  RuleChoices,
  RulePreview,
} from '../../../src/event-api-types';
import { request } from '../app/api';

export type RuleDraft = {
  name: string;
  enabled: boolean;
  trigger: EventTrigger;
  action: EventAction;
};

/** A new rule: it sets fields of the first tracker whose columns are read, else it comments on GitHub. */
export function newRule(tracker: IntegrationKindName | null): RuleDraft {
  return {
    name: '',
    enabled: true,
    trigger: { kind: 'pull_request_linked' },
    action: emptyAction(
      tracker === null
        ? { kind: 'github_comment', tracker: null }
        : { kind: 'tracker_fields', tracker },
    ),
  };
}

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
  /** The repository's labels and assignable users, for a pull request rule. */
  ruleChoices: (projectId: number): Promise<RuleChoices> =>
    request('GET', `${base(projectId)}/github/rule-choices`),
  /** The fields of the project's GitHub Project a rule can set. */
  projectFields: (projectId: number): Promise<ProjectField[]> =>
    request('GET', `${base(projectId)}/github/project-fields`),
  /** The workspace members a person property can be set to. */
  notionUsers: (projectId: number): Promise<NotionUser[]> =>
    request('GET', `${base(projectId)}/notion/users`),
};
