// The stack a pull request under review is in, for the review page's agent: its pull requests bottom first, null when alone.
import { createContext, useContext } from 'react';

/** `notionPageId`: the page linked to it, read as one of the stack's default specs. */
export type StackPull = { number: number; title: string; notionPageId: string | null };

export const ReviewStackContext = createContext<StackPull[] | null>(null);

/** The open review's stack (two or more pull requests), or null. */
export function useReviewStack(): StackPull[] | null {
  return useContext(ReviewStackContext);
}
