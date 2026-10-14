import { useMutation } from '@tanstack/react-query';
import type { SpecSource } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { SpecText } from '../../../src/routes/spec-sources';
import { reviewGroupingApi } from '../../lib/review-grouping-api';
import { reviewBase, type ReviewTarget } from '../../lib/review-target';
import { useReviewGrouping } from '../../lib/use-review-grouping';
import { Button, Dialog, ErrorText, inputClass } from '../ui';

const LABELS: Record<SpecSource, string> = {
  pr: 'PR description',
  ticket: 'Ticket description',
  issue: 'GitHub issue',
  notion: 'Notion page',
};

const REF_HINTS: Partial<Record<SpecSource, string>> = {
  issue: 'Issue number or URL, e.g. 42',
  notion: 'Notion page URL',
};

/** The sources this review can read: a PR description needs a PR, a ticket's text a ticket. */
export function specSources(target: ReviewTarget, hasPullRequest: boolean): SpecSource[] {
  return [
    ...(hasPullRequest ? (['pr'] as const) : []),
    ...(target.kind === 'ticket' ? (['ticket'] as const) : []),
    'issue',
    'notion',
  ];
}

function SourcePicker({
  sources,
  kind,
  onPick,
}: {
  sources: SpecSource[];
  kind: SpecSource;
  onPick: (kind: SpecSource) => void;
}): ReactElement {
  return (
    <fieldset className="flex flex-wrap gap-3 text-sm">
      <legend className="mb-1 text-sm font-medium">Specification</legend>
      {sources.map((source) => (
        <label key={source} className="flex items-center gap-1.5">
          <input
            type="radio"
            name="spec-source"
            checked={kind === source}
            onChange={() => {
              onPick(source);
            }}
          />
          {LABELS[source]}
        </label>
      ))}
    </fieldset>
  );
}

type SpecDraft = { label: string; text: string };
type Load = ReturnType<typeof useMutation<SpecText, Error, { kind: SpecSource; ref: string }>>;

function useLoad(target: ReviewTarget, onLoaded: (spec: SpecDraft) => void): Load {
  return useMutation({
    mutationFn: (next: { kind: SpecSource; ref: string }) =>
      reviewGroupingApi.source(reviewBase(target), next.kind, next.ref),
    onSuccess: (found) => {
      onLoaded({ label: found.label, text: found.text });
    },
  });
}

/** Reads the chosen source: at once for the PR and the ticket, from a number or a URL otherwise. */
function SpecLoader({
  kind,
  loaded,
  load,
}: {
  kind: SpecSource;
  loaded: boolean;
  load: Load;
}): ReactElement {
  const [ref, setRef] = useState('');
  const hint = REF_HINTS[kind];
  if (!hint) {
    return (
      <>
        {loaded || load.isPending ? null : (
          <Button
            onClick={() => {
              load.mutate({ kind, ref: '' });
            }}
          >
            Read the {LABELS[kind].toLowerCase()}
          </Button>
        )}
        {load.isPending ? <p className="text-sm text-zinc-500">Reading…</p> : null}
        <ErrorText error={load.error} />
      </>
    );
  }
  return (
    <>
      <div className="flex gap-2">
        <input
          aria-label={hint}
          className={inputClass}
          value={ref}
          placeholder={hint}
          onChange={(event) => {
            setRef(event.target.value);
          }}
        />
        <Button
          disabled={ref.trim() === '' || load.isPending}
          onClick={() => {
            load.mutate({ kind, ref });
          }}
        >
          {load.isPending ? 'Reading…' : 'Read'}
        </Button>
      </div>
      <ErrorText error={load.error} />
    </>
  );
}

function SpecEditor({
  spec,
  onChange,
}: {
  spec: { label: string; text: string };
  onChange: (spec: { label: string; text: string }) => void;
}): ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{spec.label}</span>
      <textarea
        className={`${inputClass} h-72 font-mono text-xs`}
        value={spec.text}
        onChange={(event) => {
          onChange({ ...spec, text: event.target.value });
        }}
      />
      <span className="block text-xs text-zinc-500">
        Edit freely: the agent reads this text as it is when you start.
      </span>
    </label>
  );
}

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
  const [kind, setKind] = useState<SpecSource>(sources[0] ?? 'issue');
  const [spec, setSpec] = useState<{ label: string; text: string } | null>(null);
  const { start } = useReviewGrouping(target);
  const load = useLoad(target, setSpec);
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
