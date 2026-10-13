import type { AgentReviewView } from '../../src/api-types';
import { request } from './api';

/** `base` is the review's API root (`reviewBase`). */
export const agentReviewApi = {
  latest: (base: string): Promise<AgentReviewView | null> => request('GET', `${base}/agent-review`),
  start: (base: string): Promise<AgentReviewView> => request('POST', `${base}/agent-review`),
  cancel: (base: string): Promise<AgentReviewView> =>
    request('POST', `${base}/agent-review/cancel`),
  keepComment: (base: string, commentId: number): Promise<unknown> =>
    request('POST', `${base}/comments/${commentId}/keep`),
};
