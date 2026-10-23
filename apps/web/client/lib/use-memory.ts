// The Memory page's data: lessons and feedback, saving them with the on/off switch, curating feedback, and the lesson writer's runs.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { FeedbackItem, Lesson, LessonSuggestion } from '@union/core';
import type { LessonsSave } from '@union/core/lesson-input';

import { request } from './api';

function memoryPath(projectId: number, what: 'lessons' | 'feedback'): string {
  return `/api/projects/${projectId}/${what}`;
}

function lessonsKey(projectId: number): readonly unknown[] {
  return ['lessons', projectId];
}

function feedbackKey(projectId: number): readonly unknown[] {
  return ['feedback', projectId];
}

export function useLessons(projectId: number): UseQueryResult<Lesson[]> {
  return useQuery({
    queryKey: lessonsKey(projectId),
    queryFn: (): Promise<Lesson[]> => request('GET', memoryPath(projectId, 'lessons')),
  });
}

export function useFeedback(projectId: number): UseQueryResult<FeedbackItem[]> {
  return useQuery({
    queryKey: feedbackKey(projectId),
    queryFn: (): Promise<FeedbackItem[]> => request('GET', memoryPath(projectId, 'feedback')),
  });
}

/** What the Memory page saves: whether the lessons are sent, and every lesson. */
export type MemorySave = LessonsSave & { enabled: boolean };

/**
 * Turns memory on or off when that changed, writes every lesson (and curates their feedback), then
 * reads both lists again.
 */
export function useSaveMemory(project: {
  id: number;
  config: { memory?: boolean };
}): (save: MemorySave) => Promise<void> {
  const queryClient = useQueryClient();
  const projectId = project.id;
  return async ({ enabled, lessons, curated }) => {
    if (enabled !== (project.config.memory !== false)) {
      await request('PATCH', `/api/projects/${projectId}`, { memory: enabled });
    }
    await request('PUT', memoryPath(projectId, 'lessons'), { lessons, curated });
    await queryClient.invalidateQueries({ queryKey: feedbackKey(projectId) });
    await queryClient.invalidateQueries({ queryKey: lessonsKey(projectId) });
  };
}

/** Dismisses one feedback, or puts it back with the new ones; applies at once. */
export function useCurateFeedback(
  projectId: number,
): ReturnType<typeof useMutation<unknown, Error, { id: number; curated: boolean }>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, curated }: { id: number; curated: boolean }): Promise<unknown> =>
      request('PATCH', `${memoryPath(projectId, 'feedback')}/${id}`, { curated }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedbackKey(projectId) }),
  });
}

const SUGGESTION_POLL_MS = 2000;

function suggestionKey(projectId: number): readonly unknown[] {
  return ['lesson-suggestion', projectId];
}

function suggestionPath(projectId: number): string {
  return `/api/projects/${projectId}/lesson-suggestion`;
}

/** The lesson writer's latest run on the project (null when none or dismissed), polled while it works. */
export function useLessonSuggestion(projectId: number): UseQueryResult<LessonSuggestion | null> {
  return useQuery({
    queryKey: suggestionKey(projectId),
    queryFn: (): Promise<LessonSuggestion | null> => request('GET', suggestionPath(projectId)),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? SUGGESTION_POLL_MS : false;
    },
  });
}

/** Queues the lesson writer on some feedback (it uses the user's Claude usage), or dismisses its result. */
export function useLessonWriter(projectId: number): {
  suggest: ReturnType<typeof useMutation<unknown, Error, number[]>>;
  dismiss: ReturnType<typeof useMutation<unknown, Error, number>>;
} {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: suggestionKey(projectId) });
  const suggest = useMutation({
    mutationFn: (feedbackIds: number[]): Promise<unknown> =>
      request('POST', suggestionPath(projectId), { feedbackIds }),
    onSuccess: refresh,
  });
  const dismiss = useMutation({
    mutationFn: (id: number): Promise<unknown> =>
      request('POST', `${suggestionPath(projectId)}/${id}/dismiss`),
    onSuccess: refresh,
  });
  return { suggest, dismiss };
}
