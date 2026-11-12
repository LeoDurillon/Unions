// A ticket's files in the browser: one file's row, its note and switch, and the file picker.

import { formatBytes } from '@union/core/attachment-limits';
import { useState, type ReactElement, type ReactNode } from 'react';

import { fileProblem } from '../../lib/ticket/attachments-api';
import { Switch } from '../ui/choice';
import { Dropzone } from '../ui/dropzone';
import { Button, inputClass } from '../ui/ui';

export const ATTACHMENTS_HINT =
  'The agents find these files next to the repository and use them to reproduce and check the fix. Private files must stay out of the repository: a push that contains one is refused.';

/** The note is saved when the field is left, not on every key. */
function NoteInput({
  name,
  note,
  disabled,
  onNote,
}: {
  name: string;
  note: string;
  disabled: boolean;
  onNote: (note: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState(note);
  return (
    <input
      className={`${inputClass} text-xs`}
      placeholder="What is it? (for example: the file the import fails on)"
      aria-label={`Note for ${name}`}
      value={draft}
      disabled={disabled}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        if (draft !== note) {
          onNote(draft);
        }
      }}
    />
  );
}

/** The file's name (a download link once uploaded), size, note and whether it is private, on one line. */
function FileSummary({
  name,
  href,
  size,
  note,
  allowInRepo,
}: {
  name: string;
  href?: string;
  size: number;
  note: string;
  allowInRepo: boolean;
}): ReactElement {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      {href ? (
        <a className="truncate text-indigo-600 hover:underline dark:text-indigo-400" href={href}>
          {name}
        </a>
      ) : (
        <span className="truncate">{name}</span>
      )}
      <span className="shrink-0 text-xs text-zinc-500">{formatBytes(size)}</span>
      <span className="shrink-0 text-xs text-zinc-500">
        {allowInRepo ? 'allowed in the repository' : 'private'}
      </span>
      {note === '' ? null : (
        <span className="min-w-0 truncate text-xs text-zinc-500" title={note}>
          · {note}
        </span>
      )}
    </span>
  );
}

/** The note and the switch of an opened file row. */
export function FileDetails({
  name,
  note,
  allowInRepo,
  disabled,
  onNote,
  onAllow,
}: {
  name: string;
  note: string;
  allowInRepo: boolean;
  disabled: boolean;
  onNote: (note: string) => void;
  onAllow: (allow: boolean) => void;
}): ReactElement {
  return (
    <>
      <NoteInput name={name} note={note} disabled={disabled} onNote={onNote} />
      <Switch
        checked={allowInRepo}
        disabled={disabled}
        onChange={onAllow}
        hint="For example as a test fixture; otherwise private"
      >
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Allowed in the repository</span>
      </Switch>
    </>
  );
}

/**
 * One file on one line: its name, size, note and whether it may be committed; Edit opens the note
 * and the switch.
 */
export function FileRow({
  name,
  href,
  size,
  note,
  allowInRepo,
  disabled,
  startOpen = false,
  onNote,
  onAllow,
  onRemove,
}: {
  name: string;
  href?: string;
  size: number;
  note: string;
  allowInRepo: boolean;
  disabled: boolean;
  /** Open the note and the switch from the start (a file just picked). */
  startOpen?: boolean;
  /** Called when the note is done being edited (on blur), with the new text. */
  onNote: (note: string) => void;
  onAllow: (allow: boolean) => void;
  onRemove: () => void;
}): ReactElement {
  const [open, setOpen] = useState(startOpen);
  const summary = { name, href, size, note, allowInRepo };
  return (
    <li className="space-y-1 rounded-md border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <FileSummary {...summary} />
        <Button
          className="shrink-0 px-2 py-0.5 text-xs"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Done' : 'Edit'}
        </Button>
        <Button
          variant="quietDanger"
          className="shrink-0 px-2 py-0.5 text-xs"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
      {open ? (
        <FileDetails
          name={name}
          note={note}
          allowInRepo={allowInRepo}
          disabled={disabled}
          onNote={onNote}
          onAllow={onAllow}
        />
      ) : null}
    </li>
  );
}

/** A file picker that hands over the files it accepts, and says which ones it refused. */
export function FilePicker({
  label,
  disabled = false,
  onFiles,
}: {
  label: ReactNode;
  disabled?: boolean;
  onFiles: (files: File[], problems: string[]) => void;
}): ReactElement {
  return (
    <Dropzone
      multiple
      label={label}
      disabled={disabled}
      onFiles={(picked) => {
        onFiles(
          picked.filter((file) => fileProblem(file) === null),
          picked.flatMap((file) => fileProblem(file) ?? []),
        );
      }}
    />
  );
}
