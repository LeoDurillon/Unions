// Where a specification comes from (the PR description, the ticket, an issue, a Notion page): picking it, reading it, editing its text.
import { useMutation } from '@tanstack/react-query';
import type { SpecSource } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { SpecText } from '../../../src/routes/spec-sources';
import { reviewGroupingApi } from '../../lib/review-grouping-api';
import { reviewBase, type ReviewTarget } from '../../lib/review-target';
import { Segmented } from '../choice';
import { Button, ErrorText, inputClass } from '../ui';

export const LABELS: Record<SpecSource, string> = {
  pr: 'PR description',
  ticket: 'Ticket description',
  issue: 'GitHub issue',
  notion: 'Notion page',
};

export const REF_HINTS: Partial<Record<SpecSource, string>> = {
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

export function SourcePicker({
  sources,
  kind,
  onPick,
}: {
  sources: SpecSource[];
  kind: SpecSource;
  onPick: (kind: SpecSource) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <p aria-hidden className="text-sm font-medium">
        Specification
      </p>
      <Segmented
        legend="Specification"
        options={sources.map((source) => ({ value: source, label: LABELS[source] }))}
        value={kind}
        onChange={onPick}
      />
    </div>
  );
}

export type SpecDraft = { label: string; text: string };
export type Load = ReturnType<
  typeof useMutation<SpecText, Error, { kind: SpecSource; ref: string }>
>;

export function useSpecLoad(target: ReviewTarget, onLoaded: (spec: SpecDraft) => void): Load {
  return useMutation({
    mutationFn: (next: { kind: SpecSource; ref: string }) =>
      reviewGroupingApi.source(reviewBase(target), next.kind, next.ref),
    onSuccess: (found) => {
      onLoaded({ label: found.label, text: found.text });
    },
  });
}

/** Reads the chosen source: at once for the PR and the ticket, from a number or a URL otherwise. */
export function SpecLoader({
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

export function SpecEditor({
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
