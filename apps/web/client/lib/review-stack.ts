// The stack a pull request under review is in, for the review page's agent: its pull requests bottom first, null when alone.
import { createContext, useContext } from 'react';

export type StackPull = { number: number; title: string };

export const ReviewStackContext = createContext<StackPull[] | null>(null);

/** The open review's stack (two or more pull requests), or null. */
export function useReviewStack(): StackPull[] | null {
  return useContext(ReviewStackContext);
}
