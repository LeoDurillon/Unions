// A ticket's state as a pill with a dot, the same on the board's cards and in the panel; a live state's dot pulses.
import type { ReactElement } from 'react';

import type { Tone } from '../lib/labels';

const PILL: Record<Tone, string> = {
  neutral:
    'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
  blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300',
  amber:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
  green:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
};

const DOT: Record<Tone, string> = {
  neutral: 'bg-zinc-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  green: 'bg-emerald-500',
};

const SIZES = { md: 'h-6.5 px-2.5 text-xs', sm: 'h-5.5 px-2 text-[11px]' } as const;

/** Running and waiting are live (blue, amber): their dot pulses. */
export function StatusPill({
  tone,
  label,
  size = 'md',
  title,
}: {
  tone: Tone;
  label: string;
  size?: keyof typeof SIZES;
  title?: string;
}): ReactElement {
  const live = tone === 'blue' || tone === 'amber';
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border font-semibold ${SIZES[size]} ${PILL[tone]}`}
    >
      <span className="relative flex size-2 shrink-0">
        {live ? (
          <span className={`absolute inset-0 animate-ping rounded-full opacity-60 ${DOT[tone]}`} />
        ) : null}
        <span className={`relative size-2 rounded-full ${DOT[tone]}`} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
