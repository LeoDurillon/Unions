// A split ticket's Rewrite all descriptions: the agent rewrites each open slice's, one after the other.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { usePrDescription } from '../../lib/use-pr-description';
import { Button, ErrorText } from '../ui';

const HINT =
  "The agent rewrites each open slice's description about its own change, one after the other. Review and send each one from its pull request below; unsent drafts are replaced.";

/** Under the stack's other actions; the drafts show in each pull request's Description. */
export function RewriteDescriptions({
  detail,
  pr,
}: {
  detail: TicketDetail;
  pr: number;
}): ReactElement | null {
  const { ticket } = detail;
  const { view, actions } = usePrDescription(ticket.id, pr);
  const open = (ticket.stack?.slices ?? []).filter(
    (slice) => slice.prNumber !== null && slice.prState !== 'merged',
  );
  if (!view) {
    return null;
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={actions.busy || view.refusal !== null}
        title={view.refusal ?? HINT}
        onClick={actions.handleRewrite}
      >
        Rewrite all {open.length} descriptions
      </Button>
      <ErrorText error={actions.error} />
    </div>
  );
}
