import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ToolOption } from '@union/core';

import { api } from './api';

/** The tools agents pick from: built-in ones and the ones the user added. */
export function useAgentTools(): UseQueryResult<ToolOption[]> {
  return useQuery({ queryKey: ['agent-tools'], queryFn: api.tools });
}
