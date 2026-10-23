// API calls for a review's grouping by spec, under the review's API root (`reviewBase`).
import type { SpecSource } from '@union/core';

import type { GroupingView } from '../../src/routes/review-groupings';
import type { SpecText } from '../../src/routes/spec-sources';
import { request } from './api';

/** `base` is the review's API root (`reviewBase`). */
export const reviewGroupingApi = {
  latest: (base: string): Promise<GroupingView | null> => request('GET', `${base}/groupings`),
  /** A specification's text, for the user to check and edit before the agent reads it. */
  source: (base: string, kind: SpecSource, ref = ''): Promise<SpecText> =>
    request('POST', `${base}/groupings/source`, { kind, ref }),
  start: (
    base: string,
    spec: { kind: SpecSource; label: string; spec: string },
  ): Promise<GroupingView> => request('POST', `${base}/groupings`, spec),
  cancel: (base: string): Promise<GroupingView> => request('POST', `${base}/groupings/cancel`),
};
