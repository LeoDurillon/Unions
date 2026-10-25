// An agent's prompt editor, warning when the edit drops a format Union reads from the agent's answer.
import { missingFormats } from '@union/core/prompt-formats';
import type { ReactElement } from 'react';

import { inputClass } from '../ui';

export function PromptField({
  agent,
  title,
  value,
  onChange,
}: {
  agent: string;
  title: string;
  value: string;
  onChange: (prompt: string) => void;
}): ReactElement {
  const missing = missingFormats(agent, value);
  return (
    <div className="space-y-1">
      <textarea
        className={`${inputClass} min-h-96 font-mono text-xs`}
        aria-label={`${title} prompt`}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {missing.map((warning) => (
        <p key={warning} role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          {warning} You can still save it.
        </p>
      ))}
    </div>
  );
}
