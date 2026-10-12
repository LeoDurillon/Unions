import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { PullRequestRow } from './pull-request-row';

/** The ticket's pull request: link it by number or URL, or unlink it. */
export function PullRequestTab({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket, project } = detail;
  return (
    <div className="space-y-4">
      <PullRequestRow ticket={ticket} project={project} />
    </div>
  );
}
