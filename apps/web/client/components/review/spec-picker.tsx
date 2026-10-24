// Where a specification comes from (the PR description, the ticket, an issue, a Notion page): picking
// it and reading it.
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

/** A source as read: what it says, and the reference it was read from (a page URL, an issue number). */
export type SpecDraft = SpecText & { ref: string };
export type Load = ReturnType<
  typeof useMutation<SpecText, Error, { kind: SpecSource; ref: string }>
>;

export function useSpecLoad(target: ReviewTarget, onLoaded: (spec: SpecDraft) => void): Load {
  return useMutation({
    mutationFn: (next: { kind: SpecSource; ref: string }) =>
      reviewGroupingApi.source(reviewBase(target), next.kind, next.ref),
    onSuccess: (found, read) => {
      onLoaded({ ...found, ref: read.ref });
    },
  });
}

/** A button that reads a source with nothing to name: the PR's description, the ticket's text. */
function ReadAtOnce({
  kind,
  what,
  loaded,
  load,
}: {
  kind: SpecSource;
  what: string;
  loaded: boolean;
  load: Load;
}): ReactElement | null {
  if (load.isPending) {
    return <p className="text-sm text-zinc-500">Reading…</p>;
  }
  return loaded ? null : (
    <Button
      onClick={() => {
        load.mutate({ kind, ref: '' });
      }}
    >
      Read {what}
    </Button>
  );
}

/** A number or URL naming what to read. */
function RefField({
  kind,
  hint,
  load,
}: {
  kind: SpecSource;
  hint: string;
  load: Load;
}): ReactElement {
  const [ref, setRef] = useState('');
  return (
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
  );
}

/** The ways to read `kind`: a button when there is nothing to name, else a field. */
function Reader({
  kind,
  loaded,
  load,
}: {
  kind: SpecSource;
  loaded: boolean;
  load: Load;
}): ReactElement {
  const hint = REF_HINTS[kind];
  if (!hint) {
    const what = `the ${LABELS[kind].toLowerCase()}`;
    return <ReadAtOnce kind={kind} what={what} loaded={loaded} load={load} />;
  }
  return <RefField kind={kind} hint={hint} load={load} />;
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
  return (
    <>
      <Reader kind={kind} loaded={loaded} load={load} />
      <ErrorText error={load.error} />
    </>
  );
}
