import type { ProjectScript } from '@union/core';
import type { ReactElement } from 'react';

import { Button, inputClass } from '../ui';

const SEC_PER_MIN = 60;
/** The command box grows with its lines, up to this. */
const MAX_ROWS = 8;

/** A script as edited: the timeout in minutes, empty for the default. */
export type ScriptDraft = { name: string; command: string; minutes: string };

export function draftOf(script: ProjectScript): ScriptDraft {
  return {
    name: script.name,
    command: script.command,
    minutes: script.timeoutSec === undefined ? '' : String(script.timeoutSec / SEC_PER_MIN),
  };
}

/** What the settings store; an empty timeout is left out (the default). */
export function scriptOf(draft: ScriptDraft): ProjectScript {
  const script = { name: draft.name.trim(), command: draft.command.trim() };
  return draft.minutes.trim() === ''
    ? script
    : { ...script, timeoutSec: Math.round(Number(draft.minutes) * SEC_PER_MIN) };
}

/** A saved script, closed: its name, and Edit. */
export function ScriptCard({
  script,
  disabled,
  onEdit,
}: {
  script: ProjectScript;
  disabled: boolean;
  onEdit: () => void;
}): ReactElement {
  return (
    <li className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <span className="min-w-0 flex-1 truncate font-mono text-sm" title={script.command}>
        {script.name}
      </span>
      <Button disabled={disabled} onClick={onEdit}>
        Edit
      </Button>
    </li>
  );
}

function ScriptFields({
  draft,
  onChange,
}: {
  draft: ScriptDraft;
  onChange: (draft: ScriptDraft) => void;
}): ReactElement {
  const set =
    (key: keyof ScriptDraft) =>
    (event: { target: { value: string } }): void => {
      onChange({ ...draft, [key]: event.target.value });
    };
  return (
    <>
      <div className="flex items-center gap-2">
        <input
          aria-label="Script name"
          className={inputClass}
          value={draft.name}
          placeholder="Import the big IFC"
          onChange={set('name')}
        />
        <label className="flex shrink-0 items-center gap-1">
          <input
            aria-label="Timeout in minutes"
            className={`${inputClass} w-20!`}
            type="number"
            min={1}
            max={30}
            value={draft.minutes}
            placeholder="10"
            onChange={set('minutes')}
          />
          <span className="text-xs text-zinc-500">min</span>
        </label>
      </div>
      <textarea
        aria-label="Script command"
        className={`${inputClass} font-mono text-xs`}
        rows={Math.min(Math.max(draft.command.split('\n').length, 2), MAX_ROWS)}
        value={draft.command}
        placeholder="npm run import -- fixtures/big.ifc"
        onChange={set('command')}
      />
    </>
  );
}

/** The script being written or edited; Done puts it in the list, Remove only for one already in it. */
export function ScriptForm({
  draft,
  onChange,
  onDone,
  onCancel,
  onRemove,
}: {
  draft: ScriptDraft;
  onChange: (draft: ScriptDraft) => void;
  onDone: () => void;
  onCancel: () => void;
  onRemove?: () => void;
}): ReactElement {
  const empty = draft.name.trim() === '' || draft.command.trim() === '';
  return (
    <li className="space-y-2 rounded-md border border-indigo-300 p-3 dark:border-indigo-800">
      <ScriptFields draft={draft} onChange={onChange} />
      <div className="flex gap-2">
        <Button disabled={empty} onClick={onDone}>
          Done
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        {onRemove ? (
          <Button variant="danger" className="ml-auto" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
    </li>
  );
}
