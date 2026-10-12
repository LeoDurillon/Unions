import type { ReactElement, ReactNode } from 'react';

import { Field, inputClass } from '../ui';
import type { StepProps } from './draft';

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-200 py-2 text-sm dark:border-zinc-800">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function ReviewStep({ draft, patch }: StepProps): ReactElement {
  const { project } = draft;
  return (
    <div className="space-y-4">
      <dl>
        <Row label="GitHub account">
          {draft.method === 'app'
            ? `${draft.viewer?.login ?? ''} (GitHub App)`
            : draft.viewer?.login}
        </Row>
        <Row label="Repository">{draft.repo?.fullName}</Row>
        <Row label="Notion">{draft.notionTitle ?? 'Not connected'}</Row>
        <Row label="GitHub Project">
          {project?.kind === 'existing' ? project.project.title : `${project?.title ?? ''} (new)`}
        </Row>
      </dl>
      <Field label="Base branch" hint="Tickets are implemented on branches created from this one.">
        <input
          className={inputClass}
          value={draft.baseBranch}
          onChange={(event) => {
            patch({ baseBranch: event.target.value });
          }}
        />
      </Field>
    </div>
  );
}
