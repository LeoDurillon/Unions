// What a Jira field rule can pick (people, versions, components, sprints). It is read from Jira
// when a field of that type is in the editor.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { JiraPick, JiraPickedType } from '@union/core/jira-field-types';

import { request } from '../api';

/** These change rarely during one edit: one read per settings visit is enough. */
const STALE_MS = 300_000;

export function useJiraPicks(projectId: number, type: JiraPickedType): UseQueryResult<JiraPick[]> {
  return useQuery({
    queryKey: ['jira-picks', projectId, type],
    queryFn: () => request<JiraPick[]>('GET', `/api/projects/${projectId}/jira/picks/${type}`),
    staleTime: STALE_MS,
    retry: false,
  });
}
