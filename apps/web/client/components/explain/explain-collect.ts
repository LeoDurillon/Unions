// Gathering parts of the diff into an Explain conversation: the drafts, the one added to last, and its notice.

import { useCallback, useMemo, useState } from 'react';

import type { SubjectAsk } from '../../lib/review/explanation-api';
import { useExplainDrafts, type Drafts } from './explain-drafts';

/** Said after a subject was added to a conversation, with Open. */
type ExplainNotice = { conversationId: number; title: string; seq: number };

export type ExplainCollect = {
  drafts: Drafts;
  /** The conversation added to last; null before any. */
  lastAdded: number | null;
  notice: ExplainNotice | null;
  dismiss: () => void;
  /** Adds the subject (and the question, when given) to the conversation's next question. */
  addTo: (
    conversation: { id: number; title: string },
    subject: SubjectAsk,
    question?: string | null,
  ) => void;
};

/** `base`: the review's API root, which keys its drafts. */
export function useExplainCollect(base: string): ExplainCollect {
  const drafts = useExplainDrafts(base);
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const [notice, setNotice] = useState<ExplainNotice | null>(null);
  const dismiss = useCallback((): void => {
    setNotice(null);
  }, []);
  return useMemo(
    () => ({
      drafts,
      lastAdded,
      notice,
      dismiss,
      addTo: (conversation, subject, question) => {
        drafts.add(conversation.id, subject, question);
        setLastAdded(conversation.id);
        setNotice((last) => ({
          conversationId: conversation.id,
          title: conversation.title,
          seq: (last?.seq ?? 0) + 1,
        }));
      },
    }),
    [drafts, lastAdded, notice, dismiss],
  );
}
