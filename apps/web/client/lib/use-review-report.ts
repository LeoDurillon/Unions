// The newest spec report of the review, with starting and cancelling one, adding its gaps to the
// review, and marking what needs the reviewer not useful.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { ReportView } from '../../src/routes/review-reports';
import { reviewReportApi } from './review-report-api';
import { reviewBase, type ReviewTarget } from './review-target';

/** While the agent works, its status is polled (a pull request review has no live events). */
const ACTIVE_POLL_MS = 3000;

export function isReporting(report: ReportView | null | undefined): boolean {
  return report?.status === 'queued' || report?.status === 'running';
}

/** The newest spec report of the review, with starting and cancelling one, adding its gaps, and marking an item not useful. */
export function useReviewReport(target: ReviewTarget): {
  report: UseQueryResult<ReportView | null>;
  start: ReturnType<typeof useMutation<ReportView, Error, void>>;
  cancel: ReturnType<typeof useMutation<ReportView, Error, void>>;
  addGaps: ReturnType<typeof useMutation<unknown, Error, void>>;
  notUseful: ReturnType<typeof useMutation<ReportView, Error, { index: number; rule: string }>>;
} {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  const queryKey = ['review', base, 'report'];
  const report = useQuery({
    queryKey,
    queryFn: () => reviewReportApi.latest(base),
    refetchInterval: (query) => (isReporting(query.state.data) ? ACTIVE_POLL_MS : false),
  });
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey });
  return {
    report,
    start: useMutation({ mutationFn: () => reviewReportApi.start(base), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: () => reviewReportApi.cancel(base), onSuccess: refresh }),
    addGaps: useMutation({
      mutationFn: () => reviewReportApi.addGaps(base),
      // The draft shows with the review's other comments.
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['review', base, 'comments'] }),
    }),
    notUseful: useMutation({
      mutationFn: ({ index, rule }: { index: number; rule: string }) =>
        reviewReportApi.notUseful(base, index, rule),
      onSuccess: refresh,
    }),
  };
}
