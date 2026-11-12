// The throwaway container of a review side run on a pull request: one letter per kind. Their ids
// come from different tables.
import type { TicketContainer } from '../provision';

/** `a` agent review, `g` grouping, `s` spec report, `e` explanation, `v` review agent. */
export type SideReviewLetter = 'a' | 'g' | 's' | 'e' | 'v';

export function sideReviewContainer(letter: SideReviewLetter, id: number): TicketContainer {
  const name = `union-${letter}${id}`;
  return { name, homeVolume: `${name}-home`, workspaceVolume: `${name}-ws` };
}
