import type { InvestigationScope } from '@union/core';
import type { ReactElement } from 'react';

import { SCOPE_LABELS } from './investigation-labels';

const CHOICE_ON = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40';
const CHOICE_OFF = 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800';
const SCOPES: readonly InvestigationScope[] = ['repository', 'global'];

/** Repository (with the clone's name) or global subject. */
export function ScopeField({
  value,
  repository,
  onChange,
}: {
  value: InvestigationScope;
  repository: string;
  onChange: (scope: InvestigationScope) => void;
}): ReactElement {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Scope</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {SCOPES.map((scope) => (
          <label
            key={scope}
            className={`relative cursor-pointer rounded-lg border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${value === scope ? CHOICE_ON : CHOICE_OFF}`}
          >
            <input
              type="radio"
              name="investigation-scope"
              className="sr-only"
              checked={value === scope}
              onChange={() => {
                onChange(scope);
              }}
            />
            <span className="block text-sm font-medium">
              {SCOPE_LABELS[scope].title}
              {scope === 'repository' ? (
                <span className="ml-1 font-normal text-zinc-500">{repository}</span>
              ) : null}
            </span>
            <span className="block text-xs text-zinc-500">{SCOPE_LABELS[scope].description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
