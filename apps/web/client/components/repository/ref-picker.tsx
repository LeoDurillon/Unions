// The branch the Repository tab shows, as a button opening the repository's branches; a tag or commit can be
// typed too.
import { useCallback, useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';

import { useRepositoryBranches } from '../../lib/repository-api';
import { useDismiss } from '../../lib/use-dismiss';
import { BranchList } from '../branch-picker';

/** The base branch first, as GitHub lists the default one, then the others as listed. */
function baseFirst(branches: string[] | undefined, base: string): string[] | undefined {
  return branches?.includes(base) ? [base, ...branches.filter((name) => name !== base)] : branches;
}

function BranchPanel({
  projectId,
  current,
  base,
  onPick,
  onClose,
  root,
}: {
  projectId: number;
  current: string;
  base: string;
  onPick: (ref: string) => void;
  onClose: () => void;
  root: RefObject<HTMLDivElement | null>;
}): ReactElement {
  useDismiss(root, onClose);
  const listed = useRepositoryBranches(projectId, true);
  useEffect(() => {
    root.current?.querySelector<HTMLInputElement>('input[aria-label="Filter branches"]')?.focus();
  }, [root]);
  return (
    <div className="absolute left-0 z-20 mt-1 w-80 rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <BranchList
        label="Branch shown"
        listed={{ ...listed, data: baseFirst(listed.data, base) }}
        value={current}
        onPick={onPick}
        typedLabel={(name) => `Show "${name}" (a tag or commit)`}
      />
    </div>
  );
}

/** The branch shown (`current`); picking the base branch takes it out of the URL. */
export function RefPicker({
  projectId,
  current,
  base,
  onPick,
}: {
  projectId: number;
  current: string;
  base: string;
  onPick: (ref: string | null) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  const pick = (ref: string): void => {
    setOpen(false);
    onPick(ref === base ? null : ref);
  };
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        title="Show another branch"
        onClick={() => {
          setOpen((was) => !was);
        }}
        className="flex max-w-64 items-center gap-1 rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-xs text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <span className="truncate">{current}</span>
        <span aria-hidden className="text-[10px] text-zinc-500">
          ▾
        </span>
      </button>
      {open ? (
        <BranchPanel
          projectId={projectId}
          current={current}
          base={base}
          onPick={pick}
          onClose={close}
          root={root}
        />
      ) : null}
    </div>
  );
}
