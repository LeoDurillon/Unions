// The Jira project a rule's Jira action points at (statuses, settable fields), from the rules list the Events page reads.
import { useQuery } from '@tanstack/react-query';
import type { JiraRuleSource } from '@union/core';

import { eventRulesApi } from './event-rules-api';

/** Null while it loads, and for a project not connected to Jira or not read yet. */
export function useJiraRuleSource(projectId: number): JiraRuleSource | null {
  const rules = useQuery({
    queryKey: ['event-rules', projectId],
    queryFn: () => eventRulesApi.list(projectId),
  });
  return rules.data?.jira ?? null;
}
