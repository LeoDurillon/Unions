// Shared UI pieces: buttons, badges, fields, text inputs, error text and the close button.

import type { ButtonHTMLAttributes, ReactElement, ReactNode, Ref } from 'react';

import type { Tone } from '../../lib/board/labels';
import { FOCUS_RING } from './focus';

const BUTTON_VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-400',
  secondary:
    'border border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-400',
  /** A minor action beside others: no border until hovered. */
  ghost:
    'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
  /** A destructive action before it is confirmed: red text, no fill. */
  quietDanger: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40',
} as const;

/** `sm`: an action repeated on every row of a list. */
const BUTTON_SIZES = { md: 'px-3 py-1.5 text-sm', sm: 'px-2 py-0.5 text-xs' } as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
};

/** One line: a pill wrapped over two lines reads as a blob; too long, it ends in an ellipsis. */
export function Badge({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <span
      title={title}
      className={`inline-block max-w-full shrink-0 truncate rounded-full px-2 py-0.5 align-middle text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const INPUT_CLASS =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 dark:border-zinc-700 dark:bg-zinc-950';

export function Field({
  label,
  hint,
  labelHidden = false,
  children,
}: {
  label: string;
  hint?: string;
  /** Read by screen readers only: what the input is for already shows above it. */
  labelHidden?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <label data-field className="block space-y-1">
      <span className={labelHidden ? 'sr-only' : 'text-sm font-medium'}>{label}</span>
      {children}
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

export const inputClass = INPUT_CLASS;

/** The card a ticket tab's sections sit in (PR, Preview, Steps, a tracker's), like the settings pages' cards. */
export const CARD_CLASS =
  'space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900';

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}): ReactElement {
  return (
    <input
      className={INPUT_CLASS}
      value={value}
      placeholder={placeholder}
      required
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

export function ErrorText({ error }: { error: Error | null }): ReactElement | null {
  return error ? <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p> : null;
}

/** The ✕ that closes a dialog or a panel. */
export function CloseButton({ onClick }: { onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      aria-label="Close"
      title="Close"
      className={`shrink-0 rounded-md px-2 py-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${FOCUS_RING}`}
      onClick={onClick}
    >
      ✕
    </button>
  );
}
