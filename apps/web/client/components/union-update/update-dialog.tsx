// The Update dialog: the commits it pulls, and the work a restart would interrupt, with Wait and Update anyway.
import type { ReactElement } from 'react';

import type { UnionUpdateView } from '../../../src/union-update-types';
import { useStartUpdate } from '../../lib/use-union-update';
import { Button, Dialog, ErrorText } from '../ui';

type Active = UnionUpdateView['active'];

/** Subjects can repeat; their position in git's order keeps the keys apart. */
function keyed(subjects: string[]): { key: string; subject: string }[] {
  return subjects.map((subject, position) => ({ key: `${position}:${subject}`, subject }));
}

function Commits({ behind, subjects }: { behind: number; subjects: string[] }): ReactElement {
  return (
    <div className="space-y-1">
      <p className="text-sm">
        Pull {behind} commit{behind === 1 ? '' : 's'} from <code>origin/main</code> and restart
        Union. The page reloads by itself when it is back.
      </p>
      <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        {keyed(subjects).map(({ key, subject }) => (
          <li key={key}>{subject}</li>
        ))}
        {behind > subjects.length ? <li>and {behind - subjects.length} more</li> : null}
      </ul>
    </div>
  );
}

/** An update that changes the database is backed up first. */
function MigrationNote({ count }: { count: number }): ReactElement | null {
  if (count === 0) {
    return null;
  }
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      It brings {count} database migration{count === 1 ? '' : 's'}: the database is backed up first,
      to <code>backups/union-update-…</code> (the last 5 are kept). Restore one with{' '}
      <code>bun run db:restore</code>.
    </p>
  );
}

/** What runs now, and what the restart does to each kind. */
function InProgress({ active }: { active: Active }): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <p className="font-medium">Work in progress</p>
      <ul className="list-disc pl-5">
        {active.map((work) => (
          <li key={work.label}>
            {work.label}: {work.count}
          </li>
        ))}
      </ul>
      <p>
        Updating now stops it. A ticket step in progress starts again from the beginning after the
        restart, which spends Claude usage again. Other work in progress ends as failed; queued work
        runs after the restart.
      </p>
    </div>
  );
}

export function UpdateDialog({
  view,
  open,
  onClose,
}: {
  view: UnionUpdateView;
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const start = useStartUpdate();
  const busy = view.active.length > 0;
  const update = (): void => {
    start.mutate(busy, { onSuccess: onClose });
  };
  return (
    <Dialog open={open} onClose={onClose} title="Update Union">
      <div className="space-y-4">
        <Commits behind={view.update?.behind ?? 0} subjects={view.update?.subjects ?? []} />
        <MigrationNote count={view.update?.migrations ?? 0} />
        {busy ? <InProgress active={view.active} /> : null}
        <ErrorText error={start.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{busy ? 'Wait' : 'Cancel'}</Button>
          <Button variant={busy ? 'danger' : 'primary'} disabled={start.isPending} onClick={update}>
            {busy ? 'Update anyway' : 'Update and restart'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
