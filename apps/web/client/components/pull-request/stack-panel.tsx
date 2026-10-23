// A split ticket's stack in its PR tab: one line per slice with its CI, what went wrong, what can be done to it, and how it merges.
import type { ReactElement } from 'react';

import type { StackView, TicketDetail } from '../../../src/api-types';
import type { CheckCounts } from '../../../src/ci-api-types';
import { useStackChecks } from '../../lib/use-stack-checks';
import { ErrorText } from '../ui';
import { StackActions } from './stack-actions';
import { StackSliceRow } from './stack-slice-row';

/** Out-of-order merges and closed slices: the stack cannot go on as it is. */
function Problems({ stack }: { stack: StackView }): ReactElement | null {
  const label = (position: number): string => {
    const slice = stack.slices.find((candidate) => candidate.position === position);
    return slice?.prNumber ? `#${slice.prNumber}` : `slice ${position}`;
  };
  const lines = [
    ...stack.outOfOrder.map(
      (position) =>
        `${label(position)} was merged into another slice's branch, not the base: its code is not in the base. Merge the slices below it, or revert it on GitHub.`,
    ),
    ...stack.closed.map(
      (position) => `${label(position)} was closed without a merge: the stack stops there.`,
    ),
  ];
  if (lines.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1 text-xs text-red-700 dark:text-red-400">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function explanation(stack: StackView): string {
  return stack.githubStack === null
    ? 'Union keeps this stack (GitHub has none for it). Merge from the bottom on GitHub: when a slice merges, Union moves the rest onto the base by git alone; if that stops on a conflict, Restack lets the implementation agent resolve it. The ticket is merged once every slice is in the base.'
    : `A stack on GitHub (#${stack.githubStack}): merge from the bottom there. GitHub rebases the rest after each merge and Union follows; if GitHub cannot (Rebase stack on GitHub), Restack lets Union's implementation agent do it. The ticket is merged once every slice is in the base.`;
}

function HowItWorks({ stack }: { stack: StackView }): ReactElement {
  return (
    <details className="text-xs text-zinc-500">
      <summary className="cursor-pointer">How the stack merges</summary>
      <div className="mt-1 space-y-1">
        <p>{explanation(stack)}</p>
        <p>
          Rebase moves every slice onto the base at once and runs the checks, then force-pushes
          them; the implementation agent is called only for conflicts or failing checks. Split again
          plans new slices from the same code and replaces this stack. On failure the branches are
          left as they were.
        </p>
      </div>
    </details>
  );
}

/** Shown when the ticket is split, bottom slice first: merge from the bottom, on GitHub. */
export function StackPanel({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket, project } = detail;
  const { stack } = ticket;
  const checks = useStackChecks(ticket.id, Boolean(stack) && ticket.prState === 'open');
  if (!stack) {
    return null;
  }
  const ciOf = (position: number): CheckCounts | null | undefined =>
    checks.data?.slices.find((slice) => slice.position === position)?.counts;
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{stack.label}</span>
        <span className="text-xs text-zinc-500">1 is the bottom: merge it first</span>
      </div>
      <ol className="space-y-0.5">
        {stack.slices.map((slice) => (
          <StackSliceRow
            key={slice.position}
            slice={slice}
            project={project}
            current={slice.prNumber !== null && slice.prNumber === ticket.prNumber}
            ci={ciOf(slice.position)}
          />
        ))}
      </ol>
      <ErrorText error={checks.error} />
      <Problems stack={stack} />
      <StackActions detail={detail} />
      <HowItWorks stack={stack} />
    </div>
  );
}
