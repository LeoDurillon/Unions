import { formatBytes } from '@union/core/attachment-limits';
import { useState, type ReactElement, type ReactNode } from 'react';

import { fileProblem, type PendingFile } from '../lib/attachments-api';
import { Switch } from './choice';
import { Dropzone } from './dropzone';
import { Button, inputClass } from './ui';

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

/** One file: its name (a download link once uploaded), size, note, and whether it may be committed. */
export function FileRow({
  name,
  href,
  size,
  note,
  allowInRepo,
  disabled,
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
  /** Called when the note is done being edited (on blur), with the new text. */
  onNote: (note: string) => void;
  onAllow: (allow: boolean) => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <li className="space-y-1 rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">
          {href ? (
            <a className="text-indigo-600 hover:underline dark:text-indigo-400" href={href}>
              {name}
            </a>
          ) : (
            name
          )}{' '}
          <span className="text-xs text-zinc-500">{formatBytes(size)}</span>
        </span>
        <Button className="shrink-0" disabled={disabled} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <NoteInput name={name} note={note} disabled={disabled} onNote={onNote} />
      <Switch
        checked={allowInRepo}
        disabled={disabled}
        onChange={onAllow}
        hint="For example as a test fixture; otherwise private"
      >
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Allowed in the repository</span>
      </Switch>
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

/** The New ticket form's files: kept in the browser, uploaded once the ticket exists. */
export function PendingFilesField({
  files,
  onChange,
}: {
  files: PendingFile[];
  onChange: (files: PendingFile[]) => void;
}): ReactElement {
  const [problems, setProblems] = useState<string[]>([]);
  const change = (index: number, update: Partial<PendingFile>): void => {
    onChange(files.map((pending, at) => (at === index ? { ...pending, ...update } : pending)));
  };
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Files</span>
      <ul className="space-y-2">
        {files.map((pending, index) => (
          <FileRow
            // The list only changes through this form; position and name identify a row.
            // oxlint-disable-next-line react/no-array-index-key
            key={`${index}-${pending.file.name}`}
            name={pending.file.name}
            size={pending.file.size}
            note={pending.note}
            allowInRepo={pending.allowInRepo}
            disabled={false}
            onNote={(note) => {
              change(index, { note });
            }}
            onAllow={(allowInRepo) => {
              change(index, { allowInRepo });
            }}
            onRemove={() => {
              onChange(files.filter((_, at) => at !== index));
            }}
          />
        ))}
      </ul>
      <FilePicker
        label="Add files"
        onFiles={(picked, refused) => {
          setProblems(refused);
          onChange([...files, ...picked.map((file) => ({ file, note: '', allowInRepo: false }))]);
        }}
      />
      {problems.map((problem) => (
        <p key={problem} className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      ))}
      <span className="block text-xs text-zinc-500">Optional. {ATTACHMENTS_HINT}</span>
    </div>
  );
}
