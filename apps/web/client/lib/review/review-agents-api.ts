// API calls for a review's review agents, under the review's API root (`reviewBase`): the agents it can run, each one's newest run, run one, cancel.

import type { ReviewAgentsView } from '../../../src/routes/review/review-agent-runs';
import { request } from '../api';

/** `base` is the review's API root (`reviewBase`). */
export const reviewAgentsApi = {
  list: (base: string): Promise<ReviewAgentsView> => request('GET', `${base}/review-agents`),
  /** Queues `agentId` on the review's specs, as its Specs bar lists them. */
  run: (base: string, agentId: number): Promise<ReviewAgentsView> =>
    request('POST', `${base}/review-agents`, { agentId }),
  cancel: (base: string, runId: number): Promise<ReviewAgentsView> =>
    request('POST', `${base}/review-agents/${runId}/cancel`),
};
