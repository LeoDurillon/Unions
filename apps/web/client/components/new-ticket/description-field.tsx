// The New ticket description: Write / Preview, files dropped on it or attached, shown as chips under it.

import { useRef, useState, type ReactElement } from 'react';

import { fileProblem, type PendingFile } from '../../lib/ticket/attachments-api';
import { Markdown } from '../markdown/markdown';
import { ATTACHMENTS_HINT } from '../ticket/attachments';
import { Segmented } from '../ui/choice';
import { useFileDrop } from '../ui/dropzone';
import { submitOnModEnter } from './form-footer';
import { PendingFileChips } from './pending-file-chips';

type Mode = 'write' | 'preview';

const MODES: { value: Mode; label: string }[] = [
  { value: 'write', label: 'Write' },
  { value: 'preview', label: 'Preview' },
];

/** Keeps the files Union accepts as new pending ones, and says why the others were refused. */
function intake(picked: File[]): { added: PendingFile[]; refused: string[] } {
  return {
    added: picked
      .filter((file) => fileProblem(file) === null)
      .map((file) => ({ file, note: '', allowInRepo: false })),
    refused: picked.flatMap((file) => fileProblem(file) ?? []),
  };
}

function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }): ReactElement {
  return (
    <label
      title={ATTACHMENTS_HINT}
      className="cursor-pointer rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <input
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          // Cleared, so picking the same file again fires a change.
          event.target.value = '';
          onFiles(picked);
        }}
      />
      Attach files
    </label>
  );
}

function Toolbar({
  mode,
  onMode,
  onFiles,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  onFiles: (files: File[]) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
      <Segmented legend="Description" options={MODES} value={mode} onChange={onMode} />
      <span className="flex-1" />
      <span className="text-xs text-zinc-500">Markdown · drop files here</span>
      <AttachButton onFiles={onFiles} />
    </div>
  );
}

function Body({
  mode,
  body,
  onBody,
}: {
  mode: Mode;
  body: string;
  onBody: (body: string) => void;
}): ReactElement {
  if (mode === 'preview') {
    return (
      <div className="max-h-96 min-h-44 overflow-auto px-3 py-2">
        {body.trim() === '' ? (
          <p className="text-sm text-zinc-500">Nothing to preview yet.</p>
        ) : (
          <Markdown github>{body}</Markdown>
        )}
      </div>
    );
  }
  return (
    <textarea
      aria-label="Description"
      title="Markdown. This becomes the GitHub issue body."
      className="block min-h-44 w-full resize-y bg-white px-3 py-2 font-mono text-sm leading-relaxed outline-none placeholder:text-zinc-400 dark:bg-zinc-900"
      placeholder="The problem, what done looks like, anything the agents should know."
      value={body}
      onKeyDown={submitOnModEnter}
      onChange={(event) => {
        onBody(event.target.value);
      }}
    />
  );
}

export function DescriptionField({
  body,
  onBody,
  files,
  onFiles,
}: {
  body: string;
  onBody: (body: string) => void;
  files: PendingFile[];
  onFiles: (files: PendingFile[]) => void;
}): ReactElement {
  const [mode, setMode] = useState<Mode>('write');
  const [open, setOpen] = useState<number | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const add = (picked: File[]): void => {
    const { added, refused } = intake(picked);
    setProblems(refused);
    if (added.length > 0) {
      // The first new file opens, for its note.
      setOpen(files.length);
      onFiles([...files, ...added]);
    }
  };
  const over = useFileDrop(box, false, add);
  return (
    <div className="space-y-1">
      <div
        ref={box}
        className={`overflow-hidden rounded-lg border focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 ${over ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-zinc-300 dark:border-zinc-700'}`}
      >
        <Toolbar mode={mode} onMode={setMode} onFiles={add} />
        <Body mode={mode} body={body} onBody={onBody} />
        <PendingFileChips files={files} open={open} onOpen={setOpen} onChange={onFiles} />
      </div>
      {problems.map((problem) => (
        <p key={problem} className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      ))}
    </div>
  );
}
