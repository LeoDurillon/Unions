// Review with agent: the specs the change is checked against (the last run's, else the ticket's text or the PR's descriptions and linked Notion pages), for one change or a whole stack, then the start.
import type { AgentReviewSpec } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { AgentReviewView } from '../../../src/api-types';
import { useReviewStack, type StackPull } from '../../lib/review-stack';
import type { ReviewTarget } from '../../lib/review-target';
import { useDefaultSpecs, useStackDefaultSpecs } from '../../lib/use-default-specs';
import { Segmented } from '../choice';
import { Dialog } from '../ui';
import { specSources } from './spec-picker';
import { SpecsForm } from './specs-form';

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

/** The specs to start from: the last run's when it reviewed the same scope, else the defaults. */
function useInitialSpecs(
  target: ReviewTarget,
  last: AgentReviewView | null,
  stack: StackPull[] | null,
): { initial: (scope: Scope) => AgentReviewSpec[] | null; reading: (scope: Scope) => string } {
  const lastScope: Scope = last?.stack ? 'stack' : 'one';
  const lastSpecs = last?.specs ?? null;
  const projectId = target.kind === 'pull-request' ? target.projectId : 0;
  const one = useDefaultSpecs(target, !(lastScope === 'one' && lastSpecs));
  const whole = useStackDefaultSpecs(projectId, stack, !(lastScope === 'stack' && lastSpecs));
  const defaults = (scope: Scope): typeof one => (scope === 'stack' ? whole : one);
  return {
    initial: (scope) => (scope === lastScope && lastSpecs ? lastSpecs : defaults(scope).specs),
    reading: (scope) => defaults(scope).reading,
  };
}

export function AgentReviewDialog({
  target,
  hasPullRequest,
  last,
  onClose,
}: {
  target: ReviewTarget;
  hasPullRequest: boolean;
  /** The last run: the dialog starts from its specs. */
  last: AgentReviewView | null;
  onClose: () => void;
}): ReactElement {
  const stack = useReviewStack();
  const [scope, setScope] = useState<Scope>(stack ? 'stack' : 'one');
  const { initial, reading } = useInitialSpecs(target, last, stack);
  const specs = initial(scope);
  return (
    <Dialog open onClose={onClose} title="Review with agent" wide>
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          The agent reads the change and checks it against these specs. Its comments arrive as
          drafts on each pull request: nothing is sent until you send the review.
        </p>
        {stack ? <ScopePicker stack={stack} scope={scope} onChange={setScope} /> : null}
        {specs === null ? (
          <p className="text-sm text-zinc-500">Reading {reading(scope)}…</p>
        ) : (
          <SpecsForm
            key={scope}
            target={target}
            sources={specSources(target, hasPullRequest)}
            initial={specs}
            members={scope === 'stack' ? stack : null}
            onClose={onClose}
          />
        )}
      </div>
    </Dialog>
  );
}
