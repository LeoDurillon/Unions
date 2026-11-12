// A project's agent image on its settings page: what runs, what was saved, its build, and saving or
// dropping a choice. The build is polled while the worker builds.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { AgentImageView, DefaultDockerfileView } from '../../../src/routes/agent-image';
import { request } from '../app/api';

const BUILD_POLL_MS = 1500;

export type AgentImageChoice = NonNullable<AgentImageView['pending']>;

export function isBuilding(view: AgentImageView | undefined): boolean {
  return view?.status === 'queued' || view?.status === 'building';
}

type Mutation<T> = ReturnType<typeof useMutation<AgentImageView, Error, T>>;

/** The project's agent image, polled while a save is being built; a save or a drop updates it at once. */
export function useAgentImage(projectId: number): {
  image: UseQueryResult<AgentImageView>;
  save: Mutation<AgentImageChoice>;
  discard: Mutation<void>;
} {
  const queryClient = useQueryClient();
  const key = ['agent-image', projectId];
  const path = `/api/projects/${projectId}/agent-image`;
  const image = useQuery({
    queryKey: key,
    queryFn: (): Promise<AgentImageView> => request('GET', path),
    refetchInterval: (query) => (isBuilding(query.state.data) ? BUILD_POLL_MS : false),
  });
  const update = (view: AgentImageView): void => {
    queryClient.setQueryData(key, view);
  };
  const save = useMutation({
    mutationFn: (choice: AgentImageChoice): Promise<AgentImageView> => request('PUT', path, choice),
    onSuccess: update,
  });
  const discard = useMutation({
    mutationFn: (): Promise<AgentImageView> => request('DELETE', `${path}/pending`),
    onSuccess: update,
  });
  return { image, save, discard };
}

/** The default image's Dockerfile, read once: it changes only with Union itself. */
export function useDefaultDockerfile(projectId: number): UseQueryResult<DefaultDockerfileView> {
  return useQuery({
    queryKey: ['agent-image-default'],
    queryFn: (): Promise<DefaultDockerfileView> =>
      request('GET', `/api/projects/${projectId}/agent-image/default`),
    staleTime: Infinity,
  });
}
