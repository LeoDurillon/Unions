// The sidebar's Help: a menu showing the getting-started checklist again, the user guide and the keyboard
// shortcuts.
import { useRef, useState, type ReactElement } from 'react';

import { requestHelp } from '../lib/help-requests';
import { askGettingStarted } from '../lib/use-getting-started-shown';
import { MenuPanel, type MenuItem } from './overflow-menu';
import { SIDE_ITEM, SIDE_LABEL } from './sidebar-classes';

/** The user guide's index, until Union serves the guide itself. */
const GUIDE_URL = 'https://github.com/LeoDurillon/Unions/blob/main/documentation/README.md';

/** Above its button, so it stays on screen at the bottom of the sidebar. */
const ABOVE = 'bottom-full left-0 mb-1 w-max';

function HelpIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      />
    </svg>
  );
}

function helpItems(projectId: number | null, onBoard: () => void): MenuItem[] {
  return [
    {
      label: 'Getting started',
      refusal: projectId === null ? 'Open a project first' : null,
      onSelect: () => {
        if (projectId !== null) {
          onBoard();
          askGettingStarted(projectId);
        }
      },
    },
    {
      label: 'User guide',
      onSelect: () => {
        globalThis.open(GUIDE_URL, '_blank', 'noopener');
      },
    },
    {
      label: 'Keyboard shortcuts (?)',
      onSelect: () => {
        requestHelp('shortcuts');
      },
    },
  ];
}

/** Help, under Union settings: the checklist of the open project, the guide, the shortcuts. */
export function HelpMenu({
  projectId,
  onBoard,
}: {
  /** The project open on the board; null before there is one. */
  projectId: number | null;
  /** Shows the board page, where the checklist sits. */
  onBoard: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        title="Help"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen(!open);
        }}
        className={`${SIDE_ITEM} hover:bg-zinc-200/70 dark:hover:bg-zinc-800`}
      >
        <HelpIcon />
        <span className={SIDE_LABEL}>Help</span>
      </button>
      {open ? (
        <MenuPanel
          root={root}
          items={helpItems(projectId, onBoard)}
          placement={ABOVE}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
