// Small icon-only buttons for row actions (edit, delete, move, done), and their icons.
import type { ReactElement, ReactNode } from 'react';

const ICON_BUTTON =
  'flex size-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';
const DANGER =
  'flex size-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950/40 dark:hover:text-red-400';

/** An icon-only button; `label` is its title and its accessible name. */
export function IconButton({
  label,
  danger = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  /** Turns red on hover: the action deletes something. */
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={danger ? DANGER : ICON_BUTTON}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function PencilIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M13.6 2.6a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8l-9.3 9.3a1 1 0 0 1-.46.26l-4 1a.75.75 0 0 1-.91-.91l1-4a1 1 0 0 1 .26-.46l9.6-9Zm1.4 1.4L5.9 13.1l-.5 2 2-.5L16.6 5.4l-1.6-1.4Z" />
    </svg>
  );
}

export function CheckIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

export function TrashIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M8 2a1 1 0 0 0-1 1v1H4a.75.75 0 0 0 0 1.5h.3l.8 10.6A2 2 0 0 0 7.1 18h5.8a2 2 0 0 0 2-1.9l.8-10.6h.3a.75.75 0 0 0 0-1.5h-3V3a1 1 0 0 0-1-1H8Zm.5 2V3.5h3V4h-3Zm-2.7 1.5h8.4l-.8 10.5a.5.5 0 0 1-.5.5H7.1a.5.5 0 0 1-.5-.5L5.8 5.5Z" />
    </svg>
  );
}
