// The CI output given to the implementer: waiting for its next run (it can be taken back) or read.
import type { CiOutput } from '@union/core';
import type { ReactElement } from 'react';

import type { usePrChecks } from '../../lib/use-pr-checks';
import { Badge, Button, ErrorText } from '../ui';

const SHA_SHOWN = 7;
const KIND_LABELS: Record<CiOutput['kind'], string> = {
  check: 'failed check',
  job: 'job log',
  comment: 'comment',
};

export function CiGiven({
  given,
  headSha,
  drop,
}: {
  given: readonly CiOutput[];
  headSha: string;
  drop: ReturnType<typeof usePrChecks>['drop'];
}): ReactElement | null {
  if (given.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        Given to the agent
      </h4>
      <ul className="space-y-1">
        {given.map((output) => (
          <li key={output.id} className="text-sm">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                {output.forAgent === 'sent' ? (
                  <Badge tone="neutral">Read by the agent</Badge>
                ) : (
                  <Badge tone="amber">For the agent&apos;s next run</Badge>
                )}
                <span className="truncate">{output.name}</span>
                <span className="text-xs text-zinc-500">
                  {KIND_LABELS[output.kind]}, commit {output.headSha.slice(0, SHA_SHOWN)}
                  {output.headSha === headSha ? '' : ' (an earlier commit)'}
                </span>
                {output.forAgent === 'next_run' ? (
                  <Button
                    className="ml-auto"
                    disabled={drop.isPending}
                    onClick={() => {
                      drop.mutate(output.id);
                    }}
                  >
                    Take back
                  </Button>
                ) : null}
              </summary>
              <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-zinc-100 p-2 text-xs whitespace-pre-wrap dark:bg-zinc-900">
                {output.text}
              </pre>
            </details>
          </li>
        ))}
      </ul>
      <ErrorText error={drop.error} />
    </div>
  );
}
