// Review with agent: the review's specs (a stack's from each of its pull requests), the scope (this
// pull request or the whole stack), and the start.
import type { AgentReviewSpec } from '@union/core';
import { useState, type ReactElement } from 'react';

import { useReviewStack, type StackPull } from '../../lib/review-stack';
import type { ReviewTarget } from '../../lib/review-target';
import { useAgentReview } from '../../lib/use-agent-review';
import { useReviewSpecs, useStackSpecs } from '../../lib/use-review-specs';
import { Segmented } from '../choice';
import { Button, Dialog, ErrorText } from '../ui';
import { SpecSummary } from './spec-summary';

type Scope = 'stack' | 'one';

/** Whole stack or this pull request: shown only when the review is part of a stack. */
function ScopePicker({
  stack,
  scope,
  onChange,
}: {
  stack: StackPull[];
  scope: Scope;
  onChange: (scope: Scope) => void;
}): ReactElement {
  return (
    <Segmented
      legend="What the agent reviews"
      size="sm"
      options={[
        { value: 'stack', label: `The whole stack (${stack.length} pull requests)` },
        { value: 'one', label: 'This pull request only' },
      ]}
      value={scope}
      onChange={onChange}
    />
  );
}

/** The specs the run reads: this review's, or every member's of the stack. */
function useScopeSpecs(
  target: ReviewTarget,
  stack: StackPull[] | null,
  scope: Scope,
): AgentReviewSpec[] | null {
  const one = useReviewSpecs(target).active;
  const projectId = target.kind === 'pull-request' ? target.projectId : 0;
  const numbers = (stack ?? []).map((pull) => pull.number);
  const whole = useStackSpecs(projectId, numbers, scope === 'stack');
  return scope === 'stack' ? whole : one;
}

export function AgentReviewDialog({
  target,
  onClose,
}: {
  target: ReviewTarget;
  onClose: () => void;
}): ReactElement {
  const stack = useReviewStack();
  const [scope, setScope] = useState<Scope>(stack ? 'stack' : 'one');
  const specs = useScopeSpecs(target, stack, scope);
  const { start } = useAgentReview(target);
  const numbers = (stack ?? []).map((pull) => pull.number);
  return (
    <Dialog open onClose={onClose} title="Review with agent" wide>
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          The agent reads the change and checks it against the review&apos;s specs. Its comments
          arrive as drafts on each pull request: nothing is sent until you send the review.
        </p>
        {stack ? <ScopePicker stack={stack} scope={scope} onChange={setScope} /> : null}
        <SpecSummary specs={specs} onEdit={onClose} />
        <ErrorText error={start.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={specs === null || start.isPending}
            onClick={() => {
              const body =
                scope === 'stack' ? { specs: specs ?? [], stack: numbers } : { specs: specs ?? [] };
              start.mutate(body, { onSuccess: onClose });
            }}
          >
            {scope === 'stack' ? `Review the ${numbers.length} pull requests` : 'Start the review'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
