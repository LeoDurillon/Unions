// The explanation routes of a review, under its API root (`reviewBase`).
import type { AgentReviewSpec } from '@union/core';

import type { ExplanationLogView, ExplanationView } from '../../src/routes/review-explanations';
import { request } from './api';

/** New lines to explain, or a follow-up (`parentId` and `question`) on an explanation. */
export type ExplanationAsk =
  | {
      path: string;
      side: 'old' | 'new';
      start: number;
      end: number;
      question: string | null;
      specs: AgentReviewSpec[];
    }
  | { parentId: number; question: string };

export const explanationApi = {
  list: (base: string): Promise<ExplanationView[]> => request('GET', `${base}/explanations`),
  start: (base: string, ask: ExplanationAsk): Promise<ExplanationView> =>
    request('POST', `${base}/explanations`, ask),
  cancel: (base: string, id: number): Promise<ExplanationView> =>
    request('POST', `${base}/explanations/${id}/cancel`),
  log: (base: string, id: number): Promise<ExplanationLogView> =>
    request('GET', `${base}/explanations/${id}/log`),
};
