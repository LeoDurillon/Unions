// The Notion workspace members, read only when `enabled` (a person property is in view).
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { NotionUser } from '@union/core';

import { eventRulesApi } from './event-rules-api';

/** Members change rarely: one read per settings visit is enough. */
const STALE_MS = 300_000;

/** The Notion workspace members, read only when `enabled` (a person property is in view). */
export function useNotionUsers(projectId: number, enabled = true): UseQueryResult<NotionUser[]> {
  return useQuery({
    queryKey: ['notion-users', projectId],
    queryFn: () => eventRulesApi.notionUsers(projectId),
    staleTime: STALE_MS,
    retry: false,
    enabled,
  });
}
