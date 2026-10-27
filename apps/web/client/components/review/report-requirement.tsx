// One requirement of the spec report: its status, the spec's words, the code and tests that do it, the
// note, and a comment to start on its code.
import type { ReportRequirement, ReportSpec, RequirementStatus } from '@union/core';
import { STATUS_LABELS } from '@union/core/review-report-markdown';
import type { ReactElement } from 'react';

import type { Tone } from '../../lib/labels';
import { Badge } from '../ui';
import { CodeLink, type OpenLines } from './report-open';

const STATUS_TONES: Record<RequirementStatus, Tone> = {
  done: 'green',
  partial: 'amber',
  missing: 'red',
  differs: 'red',
  unclear: 'neutral',
};

function Quote({
  requirement,
  specs,
}: {
  requirement: ReportRequirement;
  specs: Omit<ReportSpec, 'text'>[];
}): ReactElement | null {
  if (requirement.spec === null) {
    return null;
  }
  const source = specs.find((spec) => spec.id === requirement.specId);
  return (
    <blockquote className="border-l-2 border-zinc-300 pl-3 text-sm whitespace-pre-wrap text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {requirement.spec}
      {source ? <span className="block text-xs text-zinc-500">— {source.label}</span> : null}
    </blockquote>
  );
}

function Proof({
  requirement,
  onOpen,
}: {
  requirement: ReportRequirement;
  onOpen: OpenLines;
}): ReactElement {
  return (
    <div className="space-y-1 text-xs text-zinc-500">
      {requirement.evidence.length > 0 ? (
        <p className="flex flex-wrap items-center gap-2">
          Code:
          {requirement.evidence.map((e) => (
            <CodeLink key={`${e.path}:${e.start}`} path={e.path} lines={e} onOpen={onOpen} />
          ))}
        </p>
      ) : null}
      <p className="flex flex-wrap items-center gap-2">
        Tests:
        {requirement.tests.length === 0
          ? ' none'
          : requirement.tests.map((path) => <CodeLink key={path} path={path} onOpen={onOpen} />)}
      </p>
    </div>
  );
}

export function ReportRequirementCard({
  requirement,
  specs,
  onOpen,
}: {
  requirement: ReportRequirement;
  specs: Omit<ReportSpec, 'text'>[];
  onOpen: OpenLines;
}): ReactElement {
  const [first] = requirement.evidence;
  const note = requirement.note || requirement.title;
  return (
    <article className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center gap-2">
        <Badge tone={STATUS_TONES[requirement.status]}>{STATUS_LABELS[requirement.status]}</Badge>
        <h4 className="min-w-0 flex-1 font-medium">{requirement.title}</h4>
        {first ? (
          <button
            type="button"
            title="Open the comment editor on its code, with the note: nothing is sent"
            className="text-xs text-indigo-700 hover:underline dark:text-indigo-300"
            onClick={() => {
              onOpen(first.path, first, `${requirement.title}: ${note}`);
            }}
          >
            Add as draft comment
          </button>
        ) : null}
      </header>
      <Quote requirement={requirement} specs={specs} />
      <Proof requirement={requirement} onOpen={onOpen} />
      {requirement.note === '' ? null : <p className="text-sm">{requirement.note}</p>}
    </article>
  );
}
