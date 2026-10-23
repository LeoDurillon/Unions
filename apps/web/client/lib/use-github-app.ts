// The global GitHub App's status; saving or removing it invalidates `['github-app']`.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { GitHubAppStatus } from '../../src/api-types';
import { api } from './api';

/** The global GitHub App's status; saving or removing it invalidates `['github-app']`. */
export function useGitHubApp(): UseQueryResult<GitHubAppStatus> {
  return useQuery({ queryKey: ['github-app'], queryFn: api.githubApp.status });
}
