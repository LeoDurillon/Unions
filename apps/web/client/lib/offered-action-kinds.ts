// The kinds of action the rule editor offers: those of the trackers the project is connected to, and GitHub's and Union's.
import { useQuery } from '@tanstack/react-query';
import { ACTION_KINDS, ACTION_TRACKERS, type ActionKind } from '@union/core/event-actions';
import type { IntegrationKindName } from '@union/core/integration-kinds';

import { eventRulesApi } from './event-rules-api';

/**
 * The kinds to offer: a tracker's only when the project is connected to it. The rule's own kind
 * stays, so editing a rule of a tracker since disconnected does not change what it does.
 */
export function offeredActionKinds(
  connected: ReadonlySet<IntegrationKindName>,
  current: ActionKind,
): ActionKind[] {
  return ACTION_KINDS.filter((kind) => {
    const tracker = ACTION_TRACKERS[kind];
    return tracker === null || connected.has(tracker) || kind === current;
  });
}

/** The kinds to offer for the project, from the rules list the Events page reads (only GitHub's and Union's until it loads). */
export function useOfferedActionKinds(projectId: number, current: ActionKind): ActionKind[] {
  const rules = useQuery({
    queryKey: ['event-rules', projectId],
    queryFn: () => eventRulesApi.list(projectId),
  });
  const connected = new Set<IntegrationKindName>();
  if (rules.data?.hasNotion) {
    connected.add('notion');
  }
  if (rules.data?.jira) {
    connected.add('jira');
  }
  return offeredActionKinds(connected, current);
}
