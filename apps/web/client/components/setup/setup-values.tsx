// Small views the setup cards share: a field with the value now in the settings under it, and a labelled list.
import type { ReactElement, ReactNode } from 'react';

/** A field of a card, and what the settings hold now when it differs. */
export function SetupField({
  label,
  now,
  proposed,
  children,
}: {
  label: string;
  /** The value in the settings; undefined or empty: not set. */
  now: string | undefined;
  proposed: string;
  children: ReactNode;
}): ReactElement {
  const current = now ?? '';
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {current === proposed ? null : (
        <span className="block text-xs text-zinc-500">
          Now:{' '}
          {current === '' ? (
            'not set'
          ) : (
            <code className="break-all whitespace-pre-wrap">{current}</code>
          )}
        </span>
      )}
    </label>
  );
}

/** A row of read-only values; nothing when the list is empty. */
export function SetupList({
  label,
  items,
}: {
  label: string;
  items: readonly string[];
}): ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-1.5 text-xs">
      <span className="font-medium">{label}:</span>
      {items.map((item) => (
        <code key={item} className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
          {item}
        </code>
      ))}
    </div>
  );
}
