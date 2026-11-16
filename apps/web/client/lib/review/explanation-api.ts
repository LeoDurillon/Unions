// The Explain routes of a review, under its API root (`reviewBase`): conversations, turns, their logs.

import type { AgentReviewSpec } from '@union/core';

import type {
  ConversationView,
  ExplanationView,
} from '../../../src/routes/review/explanation-views';
import type { ExplanationLogView } from '../../../src/routes/review/review-explanations';
import { request } from '../app/api';

/** What a turn asks about; the server reads the lines' text from the diff. */
export type SubjectAsk =
  | { kind: 'lines'; path: string; side: 'old' | 'new'; start: number; end: number }
  | { kind: 'file'; path: string }
  | { kind: 'change' };

/** A turn: in a new conversation, or in `conversationId`; without `specs` it keeps the last turn's. */
export type ExplanationAsk = {
  conversationId?: number;
  subjects: SubjectAsk[];
  question: string | null;
  specs?: AgentReviewSpec[];
};

export const explanationApi = {
  list: (base: string): Promise<ConversationView[]> => request('GET', `${base}/explanations`),
  start: (base: string, ask: ExplanationAsk): Promise<ExplanationView> =>
    request('POST', `${base}/explanations`, ask),
  cancel: (base: string, id: number): Promise<ExplanationView> =>
    request('POST', `${base}/explanations/${id}/cancel`),
  log: (base: string, id: number): Promise<ExplanationLogView> =>
    request('GET', `${base}/explanations/${id}/log`),
  rename: (base: string, id: number, title: string): Promise<unknown> =>
    request('PATCH', `${base}/explanations/conversations/${id}`, { title }),
  remove: (base: string, id: number): Promise<unknown> =>
    request('DELETE', `${base}/explanations/conversations/${id}`),
};
