// The Explain conversation the review page shows, kept in the URL (`?explain=<id>`, or `new` for a new one).

import { useMemo } from 'react';

import { setParams, useUrlParam } from '../../lib/app/url-state';

/** A conversation's id, `new` while one is written, or null for the review's latest. */
type ConversationPick = number | 'new' | null;

export type OpenConversation = {
  id: ConversationPick;
  /** Shows the conversation in the Explain tab, switching to the tab. */
  open: (id: number | 'new') => void;
  /** Shows the conversation, the tab already open; null goes back to the latest. */
  select: (id: ConversationPick) => void;
};

export function pickOf(value: string | null): ConversationPick {
  if (value === 'new') {
    return 'new';
  }
  const id = Number(value);
  return value !== null && Number.isInteger(id) && id > 0 ? id : null;
}

function select(id: ConversationPick): void {
  setParams({ explain: id === null ? null : String(id) });
}

export function useOpenConversation(onOpenTab: () => void): OpenConversation {
  const id = pickOf(useUrlParam('explain'));
  return useMemo(
    () => ({
      id,
      open: (next) => {
        select(next);
        onOpenTab();
      },
      select,
    }),
    [id, onOpenTab],
  );
}
