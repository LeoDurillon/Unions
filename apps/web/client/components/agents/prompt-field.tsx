// An agent's prompt editor (the shared instructions too): Edit or Preview, with its length. It warns when the edit
// drops a format Union reads from the agent's answer.

import { missingFormats } from '@union/core/prompt-formats';
import { useState, type ReactElement } from 'react';

import { countsText } from '../../lib/union-settings/text-counts';
import { Markdown } from '../markdown/markdown';
import { Segmented, type SegmentOption } from '../ui/choice';
import { inputClass } from '../ui/ui';

type Mode = 'edit' | 'preview';

const MODES: SegmentOption<Mode>[] = [
  { value: 'edit', label: 'Edit' },
  { value: 'preview', label: 'Preview' },
];

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
  const [mode, setMode] = useState<Mode>('edit');
  const missing = missingFormats(agent, value);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Segmented
          legend={`${title} prompt view`}
          options={MODES}
          value={mode}
          onChange={setMode}
        />
        <span className="ml-auto text-xs text-zinc-500 tabular-nums">{countsText(value)}</span>
      </div>
      {mode === 'edit' ? (
        <textarea
          className={`${inputClass} min-h-[32rem] resize-y rounded-xl p-4 font-mono text-[12.5px] leading-6`}
          aria-label={`${title} prompt`}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <div className="ticket-prose min-h-[32rem] rounded-xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
          {value.trim() === '' ? (
            <p className="text-sm text-zinc-500">Nothing written yet.</p>
          ) : (
            <Markdown>{value}</Markdown>
          )}
        </div>
      )}
      {missing.map((warning) => (
        <p key={warning} role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          {warning} You can still save it.
        </p>
      ))}
    </div>
  );
}
