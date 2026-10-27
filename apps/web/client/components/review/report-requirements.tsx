// The spec report's requirements: the ones to check as cards, the ones done as asked closed until
// clicked.
import type { ReportRequirement, ReportSpec } from '@union/core';
import type { ReactElement } from 'react';

import type { OpenLines } from './report-open';
import { ReportRequirementCard } from './report-requirement';
import { ReportSection } from './report-sections';

function Cards({
  requirements,
  specs,
  onOpen,
}: {
  requirements: ReportRequirement[];
  specs: Omit<ReportSpec, 'text'>[];
  onOpen: OpenLines;
}): ReactElement {
  return (
    <div className="space-y-2">
      {requirements.map((requirement) => (
        <ReportRequirementCard
          key={requirement.key}
          requirement={requirement}
          specs={specs}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

export function ReportRequirements({
  requirements,
  specs,
  onOpen,
}: {
  requirements: ReportRequirement[];
  specs: Omit<ReportSpec, 'text'>[];
  onOpen: OpenLines;
}): ReactElement {
  const done = requirements.filter((requirement) => requirement.status === 'done');
  const toCheck = requirements.filter((requirement) => requirement.status !== 'done');
  return (
    <>
      <ReportSection id="report-requirements" title="Requirements to check" count={toCheck.length}>
        <Cards requirements={toCheck} specs={specs} onOpen={onOpen} />
      </ReportSection>
      <ReportSection id="report-done" title="Done as asked" count={done.length} collapsed>
        <Cards requirements={done} specs={specs} onOpen={onOpen} />
      </ReportSection>
    </>
  );
}
