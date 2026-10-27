// API calls for a review's spec report, under the review's API root (`reviewBase`).
import type { ReportView } from '../../src/routes/review-reports';
import { request } from './api';

/** `base` is the review's API root (`reviewBase`). */
export const reviewReportApi = {
  latest: (base: string): Promise<ReportView | null> => request('GET', `${base}/reports`),
  /** Queues a report on the review's specs, as its Specs bar lists them. */
  start: (base: string): Promise<ReportView> => request('POST', `${base}/reports`),
  cancel: (base: string): Promise<ReportView> => request('POST', `${base}/reports/cancel`),
  /** Adds a draft on the whole change asking for the requirements the report found not met. */
  addGaps: (base: string): Promise<unknown> => request('POST', `${base}/reports/gaps`),
  /** Hides an item of what needs the reviewer; a non-empty rule becomes a spec report lesson. */
  notUseful: (base: string, index: number, rule: string): Promise<ReportView> =>
    request('POST', `${base}/reports/attention/${index}/not-useful`, { rule }),
};
