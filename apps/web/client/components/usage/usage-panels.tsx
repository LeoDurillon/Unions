// The Usage page's two tab panels: the Cost tab and the What to improve tab, each its shape while it is read.

import type { UseQueryResult } from '@tanstack/react-query';
import type { ProjectFindings, ProjectUsage } from '@union/core';
import type { ReactElement } from 'react';

import type { UsageRange } from '../../lib/usage/use-usage';
import { ErrorText } from '../ui/ui';
import { ImproveBanner } from './improve-banner';
import { SuggestImprovements } from './suggest-improvements';
import { UsageCost } from './usage-cost';
import { UsageFindings } from './usage-findings';
import { UsageCostLoading, UsageFindingsLoading } from './usage-loading';

export function CostPanel({
  usage,
  findings,
  onImprove,
  onOpenTicket,
}: {
  usage: UseQueryResult<ProjectUsage>;
  findings: ProjectFindings | undefined;
  onImprove: () => void;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  if (usage.isPending) {
    return <UsageCostLoading />;
  }
  if (!usage.data) {
    return <ErrorText error={usage.error} />;
  }
  return (
    <UsageCost
      usage={usage.data}
      improve={<ImproveBanner findings={findings} onOpen={onImprove} />}
      onOpenTicket={onOpenTicket}
    />
  );
}

export function ImprovePanel({
  findings,
  projectId,
  range,
  onOpenTicket,
}: {
  findings: UseQueryResult<ProjectFindings>;
  projectId: number;
  range: UsageRange;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  if (findings.isPending) {
    return <UsageFindingsLoading />;
  }
  if (!findings.data) {
    return <ErrorText error={findings.error} />;
  }
  return (
    <UsageFindings
      findings={findings.data}
      action={<SuggestImprovements projectId={projectId} range={range} />}
      onOpenTicket={onOpenTicket}
    />
  );
}
