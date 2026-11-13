// API calls for a review's agent review, under the review's API root (`reviewBase`).

import type { AgentReviewSpec } from '@union/core';

import type { AgentReviewView } from '../../../src/api-types';
import { request } from '../app/api';

/** `mode` sliced: one agent per part of the change, then one on how they fit. */
export type AgentReviewStart = {
  specs: AgentReviewSpec[];
  stack?: number[];
  mode?: 'single' | 'sliced';
};

/** `base` is the review's API root (`reviewBase`). */
export const agentReviewApi = {
  latest: (base: string): Promise<AgentReviewView | null> => request('GET', `${base}/agent-review`),
  /** `stack`: the pull requests of the stack to review in one run, with this one among them. */
  start: (base: string, body: AgentReviewStart): Promise<AgentReviewView> =>
    request('POST', `${base}/agent-review`, body),
  cancel: (base: string): Promise<AgentReviewView> =>
    request('POST', `${base}/agent-review/cancel`),
  keepComment: (base: string, commentId: number): Promise<unknown> =>
    request('POST', `${base}/comments/${commentId}/keep`),
};
