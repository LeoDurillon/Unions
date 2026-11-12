// The review's Agents tab: Run agent (the user's review agents, one run at a time on the change).
// Then each agent's newest run with its answer.

import { useState, type ReactElement } from 'react';

import type { ReviewAgentsView } from '../../../src/routes/review/review-agent-runs';
import type { ReviewTarget } from '../../lib/review/review-target';
import { isActive, useReviewAgents } from '../../lib/review/use-review-agents';
import { Button, ErrorText, inputClass } from '../ui';
import { NewAgentButton } from '../union-settings/new-agent-dialog';
import { useDiffLinks } from './diff-link-code';
import { ReviewAgentRunCard } from './review-agent-run-card';

/** Why Run is off: the change cannot be read, or an agent already works on it. */
function blocked(view: ReviewAgentsView): string | null {
  if (view.refusal !== null) {
    return view.refusal;
  }
  return view.runs.some(isActive)
    ? 'One agent runs at a time on a change: wait for it, or cancel it.'
    : null;
}

function NoAgents(): ReactElement {
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
      <p>
        Review agents are your own: describe what one should check (whether a pull request can be
        merged, a security pass, an API contract), and Union writes its prompt. It runs in a copy of
        the change it may build and test, and answers here.
      </p>
      <NewAgentButton kind="review" label="New review agent" />
    </div>
  );
}

function RunAgent({
  view,
  pending,
  onRun,
}: {
  view: ReviewAgentsView;
  pending: boolean;
  onRun: (agentId: number) => void;
}): ReactElement {
  const [picked, setPicked] = useState<number | null>(null);
  const agentId = picked ?? view.agents[0]?.id ?? null;
  const reason = blocked(view);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Review agent"
        className={`${inputClass} w-auto`}
        value={agentId ?? ''}
        onChange={(event) => {
          setPicked(Number(event.target.value));
        }}
      >
        {view.agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      <Button
        variant="primary"
        disabled={agentId === null || reason !== null || pending}
        onClick={() => {
          if (agentId !== null) {
            onRun(agentId);
          }
        }}
      >
        Run agent
      </Button>
      {reason === null ? null : <span className="text-sm text-zinc-500">{reason}</span>}
    </div>
  );
}

/** `openDiff` switches to the Diff tab, where the answers' file references open. */
export function ReviewAgentsTab({
  target,
  openDiff,
}: {
  target: ReviewTarget;
  openDiff: () => void;
}): ReactElement {
  const { agents, run, cancel } = useReviewAgents(target);
  const renderCode = useDiffLinks(target, openDiff);
  const view = agents.data;
  if (agents.isPending) {
    return <p className="text-sm text-zinc-500">Loading the review agents…</p>;
  }
  if (!view) {
    return <ErrorText error={agents.error} />;
  }
  const busy = blocked(view) !== null;
  return (
    <div className="space-y-4">
      {view.agents.length === 0 ? (
        <NoAgents />
      ) : (
        <RunAgent
          view={view}
          pending={run.isPending}
          onRun={(agentId) => {
            run.mutate(agentId);
          }}
        />
      )}
      <ErrorText error={run.error ?? cancel.error} />
      {view.runs.map((row) => (
        <ReviewAgentRunCard
          key={row.id}
          run={row}
          busy={busy || run.isPending}
          renderCode={renderCode}
          onRun={() => {
            run.mutate(row.agentId);
          }}
          onCancel={() => {
            cancel.mutate(row.id);
          }}
        />
      ))}
    </div>
  );
}
