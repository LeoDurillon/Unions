// A finished spec report, in the order a reviewer uses it: its header (verdict, summary, actions), what
// needs them, the files to read first and to skim, the requirements to check (the done ones closed), then
// the other sections.
import type { ReactElement } from 'react';

import type { ReportView } from '../../../src/routes/review-reports';
import type { ReviewTarget } from '../../lib/review-target';
import { ReportAttention } from './report-attention';
import { ReportHeader } from './report-header';
import { ReportImportantFiles } from './report-important-files';
import type { OpenLines } from './report-open';
import { ReportRequirements } from './report-requirements';
import { ReportSections } from './report-sections';
import { ReportSkim, ReportUnreviewed } from './report-skim';

export function ReportBody({
  target,
  report,
  onOpen,
  onAgain,
}: {
  target: ReviewTarget;
  report: ReportView;
  onOpen: OpenLines;
  onAgain: () => void;
}): ReactElement | null {
  const { result } = report;
  if (!result) {
    return null;
  }
  return (
    <div className="space-y-6">
      <ReportHeader target={target} report={report} onAgain={onAgain} />
      <ReportAttention result={result} onOpen={onOpen} />
      <ReportImportantFiles files={result.importantFiles} onOpen={onOpen} />
      <ReportSkim result={result} onOpen={onOpen} />
      <ReportRequirements requirements={result.requirements} specs={report.specs} onOpen={onOpen} />
      <ReportSections result={result} onOpen={onOpen} />
      <ReportUnreviewed result={result} onOpen={onOpen} />
    </div>
  );
}
