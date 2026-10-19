// The Notion page of the open review (the page linked to a pull request, or a ticket's), for its spec sources.
import { createContext, useContext } from 'react';

export const ReviewNotionContext = createContext<string | null>(null);

/** The open review's Notion page id, or null: the spec picker then reads it with no URL. */
export function useLinkedNotionPage(): string | null {
  return useContext(ReviewNotionContext);
}
