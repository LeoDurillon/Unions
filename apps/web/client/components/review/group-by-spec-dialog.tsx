import type { SpecSource } from '@union/core';
import { useEffect, useState, type ReactElement } from 'react';

import { useLinkedNotionPage } from '../../lib/review-notion-context';
import type { ReviewTarget } from '../../lib/review-target';
import { useReviewGrouping } from '../../lib/use-review-grouping';
import { Button, Dialog, ErrorText } from '../ui';
import { SourcePicker, SpecEditor, SpecLoader, useSpecLoad } from './spec-picker';

/**
 * Picks the specification the change is grouped by, shows its text (editable: keep only the part
 * that matters), and starts the agent.
 */
export function GroupBySpecDialog({
  target,
  sources,
  open,
  onClose,
}: {
  target: ReviewTarget;
  sources: SpecSource[];
  open: boolean;
  onClose: () => void;
}): ReactElement {
  // A page linked to the pull request is the user saying "this is the spec": read it at once.
  const startOnNotion = useLinkedNotionPage() !== null && target.kind === 'pull-request';
  const [kind, setKind] = useState<SpecSource>(startOnNotion ? 'notion' : (sources[0] ?? 'issue'));
  const [spec, setSpec] = useState<{ label: string; text: string } | null>(null);
  const { start } = useReviewGrouping(target);
  const load = useSpecLoad(target, setSpec);
  const { mutate } = load;
  useEffect(() => {
    if (startOnNotion) {
      mutate({ kind: 'notion', ref: '' });
    }
  }, [startOnNotion, mutate]);
  const ready = spec !== null && spec.text.trim() !== '';
  return (
    <Dialog open={open} onClose={onClose} title="Group the change by spec" wide>
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          An agent reads this specification and the change, and groups the changed files by the part
          of the spec they implement. It runs once, when you start it.
        </p>
        <SourcePicker
          sources={sources}
          kind={kind}
          onPick={(next) => {
            setKind(next);
            setSpec(null);
            load.reset();
          }}
        />
        <SpecLoader key={kind} kind={kind} loaded={spec !== null} load={load} />
        {spec ? <SpecEditor spec={spec} onChange={setSpec} /> : null}
        <ErrorText error={start.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || start.isPending}
            onClick={() => {
              if (spec) {
                start.mutate({ kind, label: spec.label, spec: spec.text }, { onSuccess: onClose });
              }
            }}
          >
            Start grouping
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
