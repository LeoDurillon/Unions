// The New ticket form's files as chips under the description; a chip opens its note and switch.

import { formatBytes } from '@union/core/attachment-limits';
import type { ReactElement } from 'react';

import type { PendingFile } from '../../lib/ticket/attachments-api';
import { FileDetails } from '../ticket/attachments';

function FileChip({
  pending,
  open,
  onToggle,
  onRemove,
}: {
  pending: PendingFile;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
}): ReactElement {
  const { name, size } = pending.file;
  return (
    <li
      className={`flex max-w-full items-center rounded-full border text-xs ${open ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50' : 'border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800'}`}
    >
      <button
        type="button"
        aria-expanded={open}
        title="Its note, and whether it may be committed"
        className="flex min-w-0 items-center gap-1 py-0.5 pr-1 pl-2.5"
        onClick={onToggle}
      >
        <span className="truncate">{name}</span>
        <span className="shrink-0 text-zinc-500">
          · {formatBytes(size)}
          {pending.allowInRepo ? '' : ' · private'}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title="Remove"
        className="shrink-0 rounded-full px-1.5 py-0.5 text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
        onClick={onRemove}
      >
        ✕
      </button>
    </li>
  );
}

/** `open`: the index of the file whose note and switch show, or null. */
export function PendingFileChips({
  files,
  open,
  onOpen,
  onChange,
}: {
  files: PendingFile[];
  open: number | null;
  onOpen: (index: number | null) => void;
  onChange: (files: PendingFile[]) => void;
}): ReactElement | null {
  if (files.length === 0) {
    return null;
  }
  const change = (index: number, update: Partial<PendingFile>): void => {
    onChange(files.map((pending, at) => (at === index ? { ...pending, ...update } : pending)));
  };
  const opened = open === null ? undefined : files[open];
  return (
    <div className="space-y-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <ul className="flex flex-wrap gap-1.5" aria-label="Files">
        {files.map((pending, index) => (
          <FileChip
            // The list only changes through this form; position and name identify a chip.
            // oxlint-disable-next-line react/no-array-index-key
            key={`${index}-${pending.file.name}`}
            pending={pending}
            open={index === open}
            onToggle={() => {
              onOpen(index === open ? null : index);
            }}
            onRemove={() => {
              onOpen(null);
              onChange(files.filter((_, at) => at !== index));
            }}
          />
        ))}
      </ul>
      {open !== null && opened ? (
        // A new key per file, so the note field starts from that file's note.
        <div key={`${open}-${opened.file.name}`} className="space-y-2">
          <FileDetails
            name={opened.file.name}
            note={opened.note}
            allowInRepo={opened.allowInRepo}
            disabled={false}
            onNote={(note) => {
              change(open, { note });
            }}
            onAllow={(allowInRepo) => {
              change(open, { allowInRepo });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
