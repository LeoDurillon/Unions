// The stack a pull request under review is in, for the review page's agent. Its pull requests come
// bottom first; null when alone.
import type { IntegrationKindName } from '@union/core/integration-kinds';
import { createContext, useContext } from 'react';

/** `linked`: the trackers it has an item of (Link the whole stack offers an item to those without one). */
export type StackPull = { number: number; title: string; linked: IntegrationKindName[] };

export const ReviewStackContext = createContext<StackPull[] | null>(null);

/** The open review's stack (two or more pull requests), or null. */
export function useReviewStack(): StackPull[] | null {
  return useContext(ReviewStackContext);
}
