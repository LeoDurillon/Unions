// The New ticket dialog's GitHub tab: an issue (with the flow picker) or a pull request. A pull
// request comes on its own branch, its flow decided by the import.
import type { PipelineStep } from '@union/core/states';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Segmented, type SegmentOption } from './choice';
import { GitHubIssueImportPanel } from './github-issue-import';
import { GitHubPullRequestImportPanel } from './github-pr-import';

type Kind = 'issue' | 'pull_request';

const KINDS: SegmentOption<Kind>[] = [
  { value: 'issue', label: 'Issue' },
  { value: 'pull_request', label: 'Pull request' },
];

/** An issue or a pull request of the project's repository, imported as a ticket. */
export function GitHubImportPanel({
  projectId,
  flow,
  flowField,
  onCreated,
}: {
  projectId: number;
  flow: PipelineStep[] | null;
  flowField: ReactNode;
  onCreated: (ticketId: number) => void;
}): ReactElement {
  const [kind, setKind] = useState<Kind>('issue');
  return (
    <div className="space-y-4">
      <Segmented legend="Import" options={KINDS} value={kind} onChange={setKind} size="sm" />
      {kind === 'issue' ? (
        <>
          {flowField}
          <GitHubIssueImportPanel projectId={projectId} flow={flow} onCreated={onCreated} />
        </>
      ) : (
        <GitHubPullRequestImportPanel projectId={projectId} onCreated={onCreated} />
      )}
    </div>
  );
}
