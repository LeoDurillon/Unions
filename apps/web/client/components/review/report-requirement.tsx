// One requirement of the spec report: its status, the spec's words, the note, the code and tests that do
// it, and a comment to start on its code.
import type { ReportRequirement, ReportSpec, RequirementStatus } from '@union/core';
import { STATUS_LABELS } from '@union/core/review-report-markdown';
import type { ReactElement } from 'react';

import type { Tone } from '../../lib/labels';
import { Badge } from '../ui';
import { byFile, DraftButton, FileLink, FileRef, type OpenLines } from './report-open';

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
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 text-xs">
      {requirement.evidence.length > 0 ? (
        <>
          <dt className="text-zinc-500">Code</dt>
          <dd className="space-y-1">
            {byFile(requirement.evidence).map((file) => (
              <FileRef key={file.path} path={file.path} lines={file.lines} onOpen={onOpen} />
            ))}
          </dd>
        </>
      ) : null}
      <dt className="text-zinc-500">Tests</dt>
      <dd className="space-y-1">
        {requirement.tests.length === 0 ? (
          <span className="text-zinc-500">none</span>
        ) : (
          requirement.tests.map((path) => (
            <span key={path} className="flex">
              <FileLink path={path} onOpen={onOpen} />
            </span>
          ))
        )}
      </dd>
    </dl>
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
        <h4 className="min-w-0 flex-1 text-sm font-medium">{requirement.title}</h4>
        {first ? (
          <DraftButton cite={first} draft={`${requirement.title}: ${note}`} onOpen={onOpen} />
        ) : null}
      </header>
      <Quote requirement={requirement} specs={specs} />
      {requirement.note === '' ? null : <p className="text-sm">{requirement.note}</p>}
      <Proof requirement={requirement} onOpen={onOpen} />
    </article>
  );
}
