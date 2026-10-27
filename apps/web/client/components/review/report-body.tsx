// A finished spec report: its header (verdict, counts, actions), then the files to read first, the
// requirements and the other sections.
import type { ReactElement } from 'react';

import type { ReportView } from '../../../src/routes/review-reports';
import type { ReviewTarget } from '../../lib/review-target';
import { ReportHeader } from './report-header';
import { ReportImportantFiles } from './report-important-files';
import type { OpenLines } from './report-open';
import { ReportRequirementCard } from './report-requirement';
import { ReportSections } from './report-sections';

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
      <ReportImportantFiles files={result.importantFiles} onOpen={onOpen} />
      {result.requirements.length > 0 ? (
        <section id="report-requirements" className="space-y-2">
          <h3 className="font-semibold">Requirements</h3>
          {result.requirements.map((requirement) => (
            <ReportRequirementCard
              key={requirement.key}
              requirement={requirement}
              specs={report.specs}
              onOpen={onOpen}
            />
          ))}
        </section>
      ) : null}
      <ReportSections result={result} onOpen={onOpen} />
    </div>
  );
}
