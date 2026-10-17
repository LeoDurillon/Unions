// The Memory page's data: the project's lessons and feedback, saving the lessons, and curating one feedback.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { FeedbackItem, Lesson } from '@union/core';
import type { LessonsSave } from '@union/core/lesson-input';

import { request } from './api';

function memoryPath(projectId: number, what: 'lessons' | 'feedback'): string {
  return `/api/projects/${projectId}/${what}`;
}

export function lessonsKey(projectId: number): readonly unknown[] {
  return ['lessons', projectId];
}

export function feedbackKey(projectId: number): readonly unknown[] {
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

/** Writes every lesson (and curates their feedback), then reads both lists again. */
export function useSaveLessons(projectId: number): (save: LessonsSave) => Promise<void> {
  const queryClient = useQueryClient();
  return async (save) => {
    await request('PUT', memoryPath(projectId, 'lessons'), save);
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
