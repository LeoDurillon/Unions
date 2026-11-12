// The keyboard shortcuts: `?` (or the Help menu) lists them anywhere, c writes a new ticket from the board.

import { useState, type ReactElement } from 'react';

import { useHelpRequest } from '../../lib/app/help-requests';
import { useUrlParam } from '../../lib/app/url-state';
import { useShortcuts } from '../../lib/ui/shortcuts';
import { Dialog } from '../ui/ui';

type Group = { title: string; keys: [string, string][] };

const GROUPS: Group[] = [
  {
    title: 'Anywhere',
    keys: [['?', 'This list']],
  },
  {
    title: 'Board',
    keys: [
      ['/', 'Search the tickets'],
      ['c', 'New ticket'],
      ['n', 'Open the first ticket that needs you, else go to the next project with one'],
    ],
  },
  {
    title: 'Ticket',
    keys: [
      ['n', 'Next ticket that needs you'],
      ['p', 'Previous ticket that needs you'],
      ['r', 'Review the changes'],
      ['1 – 5', 'Overview, Preview, Steps, PR, Notion or Jira'],
      ['Esc', 'Close the ticket'],
    ],
  },
  {
    title: 'Repository',
    keys: [['/', 'Go to file']],
  },
  {
    title: 'Review',
    keys: [
      ['j', 'Next file'],
      ['k', 'Previous file'],
      ['v', 'Mark viewed, then next file'],
      ['/', 'Filter files'],
    ],
  },
];

function GroupList({ group }: { group: Group }): ReactElement {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{group.title}</h3>
      <dl className="space-y-1 text-sm">
        {group.keys.map(([key, what]) => (
          <div key={`${group.title}-${key}`} className="flex items-center gap-3">
            <dt className="w-14 shrink-0">
              <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800">
                {key}
              </kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Listens for ? (the list of shortcuts) and, while `onNewTicket` is given and no ticket or review is
 * open, c; shows the list. Keys typed in a field, with Ctrl, ⌘ or Alt, or under another dialog do
 * nothing.
 */
export function ShortcutsHelp({ onNewTicket }: { onNewTicket?: () => void }): ReactElement {
  const [open, setOpen] = useState(false);
  const ticket = useUrlParam('ticket');
  const reviewedPr = useUrlParam('review-pr');
  const covered = ticket !== null || reviewedPr !== null;
  useShortcuts({
    '?': () => {
      setOpen(true);
    },
    c: covered ? undefined : onNewTicket,
  });
  useHelpRequest('shortcuts', () => {
    setOpen(true);
  });
  return (
    <Dialog
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      title="Keyboard shortcuts"
    >
      <div className="space-y-4">
        {GROUPS.map((group) => (
          <GroupList key={group.title} group={group} />
        ))}
        <p className="text-xs text-zinc-500">
          Keys typed in a text field belong to the field. Ctrl, ⌘ and Alt combinations are left to
          the browser.
        </p>
      </div>
    </Dialog>
  );
}
