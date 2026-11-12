// A GitHub author's round avatar in the discussion: their initials, drawn here, so no image is fetched.

import type { ReactElement } from 'react';

const INITIALS = 2;

/** `octo-cat` → OC, `coderabbitai[bot]` → CO; a deleted account (ghost) → GH. */
export function initialsOf(login: string): string {
  const name = login.replace(/\[bot\]$/u, '');
  const parts = name.split(/[-_.]/u).filter((part) => part !== '');
  const letters = parts.length >= INITIALS ? parts.map((part) => part.charAt(0)).join('') : name;
  return letters.slice(0, INITIALS).toUpperCase();
}

export function NoteAvatar({ login }: { login: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="flex size-6.5 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
    >
      {initialsOf(login)}
    </span>
  );
}
