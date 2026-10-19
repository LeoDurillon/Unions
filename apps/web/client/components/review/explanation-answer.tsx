// An explanation's answer: how the lines work with their cited code, the specs and docs they relate to.
import type { ExplanationResult } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import { Markdown } from '../markdown';

/** `path:line` as the agent cites code, in backticks or not. */
const CITATION = /(?<path>[\w.@-]+(?:\/[\w.@-]+)+|[\w-]+\.\w+):(?<line>\d+)/gu;

export type Citation = { path: string; line: number };

/** The answer's citations of files in the change, once each, in their order. */
export function citationsOf(text: string, paths: ReadonlySet<string>): Citation[] {
  const seen = new Set<string>();
  const found: Citation[] = [];
  for (const match of text.matchAll(CITATION)) {
    const path = match.groups?.path ?? '';
    const [key] = match;
    if (paths.has(path) && !seen.has(key)) {
      seen.add(key);
      found.push({ path, line: Number(match.groups?.line) });
    }
  }
  return found;
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
      <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{title}</h4>
      {children}
    </section>
  );
}

function Citations({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (citation: Citation) => void;
}): ReactElement | null {
  if (citations.length === 0) {
    return null;
  }
  return (
    <p className="flex flex-wrap gap-1 text-xs">
      {citations.map((citation) => (
        <button
          key={`${citation.path}:${citation.line}`}
          type="button"
          className="max-w-full rounded bg-zinc-100 px-1.5 py-0.5 text-left font-mono break-all text-indigo-700 hover:underline dark:bg-zinc-800 dark:text-indigo-300"
          onClick={() => {
            onOpen(citation);
          }}
        >
          {citation.path}:{citation.line}
        </button>
      ))}
    </p>
  );
}

function Specs({ result }: { result: ExplanationResult }): ReactElement {
  if (result.specs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {result.notInSpec ?? 'No part of the specs was cited for these lines.'}
      </p>
    );
  }
  return (
    <ul className="space-y-2 text-sm">
      {result.specs.map((spec) => (
        <li key={`${spec.source}-${spec.quote}`}>
          <blockquote className="border-l-2 border-indigo-300 pl-2 italic">
            “{spec.quote}”
          </blockquote>
          <p className="text-xs text-zinc-500">
            {spec.source}
            {spec.how ? ` · ${spec.how}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The answer's sections; a citation of a file in the change opens it on that line. */
export function ExplanationAnswer({
  result,
  paths,
  onOpen,
}: {
  result: ExplanationResult;
  paths: ReadonlySet<string>;
  onOpen: (citation: Citation) => void;
}): ReactElement {
  return (
    <div className="space-y-3">
      <Section title="How it works">
        <Markdown compact>{result.explanation}</Markdown>
        <Citations citations={citationsOf(result.explanation, paths)} onOpen={onOpen} />
      </Section>
      <Section title={result.specs.length === 0 ? 'Not in the spec' : 'Specs'}>
        <Specs result={result} />
      </Section>
      {result.docs.length > 0 ? (
        <Section title="Docs">
          <ul className="space-y-1 text-sm">
            {result.docs.map((doc) => (
              <li key={`${doc.path}-${doc.heading}`}>
                <span className="font-mono text-xs">
                  {doc.path}
                  {doc.heading ? ` § ${doc.heading}` : ''}
                </span>
                {doc.why ? <span className="text-zinc-500"> · {doc.why}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {result.dropped > 0 ? (
        <p className="text-xs text-zinc-500">
          {result.dropped} citation(s) dropped: not found in the specs or the repository.
        </p>
      ) : null}
    </div>
  );
}
