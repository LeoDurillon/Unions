// Where a specification comes from (the PR description, the ticket, an issue, a Notion page, the linked one by default): picking it, reading it, editing its text.
import { useMutation } from '@tanstack/react-query';
import type { SpecSource } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { SpecText } from '../../../src/routes/spec-sources';
import { reviewGroupingApi } from '../../lib/review-grouping-api';
import { useLinkedNotionPage } from '../../lib/review-notion-context';
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

/** A button that reads a source with nothing to name: the PR, the ticket, the linked Notion page. */
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

/** The ways to read `kind`: a button, a field, or both for a review linked to a Notion page. */
function Reader({
  kind,
  linked,
  loaded,
  load,
}: {
  kind: SpecSource;
  linked: boolean;
  loaded: boolean;
  load: Load;
}): ReactElement {
  const hint = REF_HINTS[kind];
  if (!hint) {
    const what = `the ${LABELS[kind].toLowerCase()}`;
    return <ReadAtOnce kind={kind} what={what} loaded={loaded} load={load} />;
  }
  if (kind === 'notion' && linked) {
    return (
      <>
        <ReadAtOnce kind={kind} what="the linked Notion page" loaded={loaded} load={load} />
        <RefField kind={kind} hint="Another page: its Notion URL" load={load} />
      </>
    );
  }
  return <RefField kind={kind} hint={hint} load={load} />;
}

/**
 * Reads the chosen source: at once for the PR, the ticket and the review's linked Notion page, from
 * a number or a URL otherwise (another Notion page than the linked one too).
 */
export function SpecLoader({
  kind,
  loaded,
  load,
}: {
  kind: SpecSource;
  loaded: boolean;
  load: Load;
}): ReactElement {
  const linked = useLinkedNotionPage();
  return (
    <>
      <Reader kind={kind} linked={linked !== null} loaded={loaded} load={load} />
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
