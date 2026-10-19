// While an explanation waits or runs: its status, the agent's last steps (the files it reads) and Cancel.
import type { ReactElement } from 'react';

import type { ExplanationView } from '../../../src/routes/review-explanations';
import { summarizeAgentEvent } from '../../lib/agent-events';
import type { ReviewTarget } from '../../lib/review-target';
import { useExplanationLog } from '../../lib/use-explanations';
import { Button } from '../ui';

const SHOWN_STEPS = 5;

/** The agent's last tool calls, keyed by their log line. */
function useSteps(
  target: ReviewTarget,
  explanation: ExplanationView,
): { key: string; text: string }[] {
  const log = useExplanationLog(target, explanation.id, explanation.status === 'running');
  return (log.data?.lines ?? [])
    .flatMap((line) =>
      summarizeAgentEvent(line.payload)
        .filter((summary) => summary.kind === 'tool')
        .map((summary) => ({ key: `${line.id}-${summary.text}`, text: summary.text })),
    )
    .slice(-SHOWN_STEPS);
}

export function ExplanationProgress({
  target,
  explanation,
  cancelling,
  onCancel,
}: {
  target: ReviewTarget;
  explanation: ExplanationView;
  cancelling: boolean;
  onCancel: () => void;
}): ReactElement {
  const steps = useSteps(target, explanation);
  const queued = explanation.status === 'queued';
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-zinc-500">{queued ? 'Waiting for a run slot…' : 'Explaining…'}</span>
        <Button disabled={cancelling} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {steps.length > 0 ? (
        <ul className="space-y-0.5 font-mono text-xs text-zinc-500">
          {steps.map((step) => (
            <li key={step.key} className="truncate">
              {step.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
