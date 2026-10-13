import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { Tone } from '../lib/labels';

const BUTTON_VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-400',
  secondary:
    'border border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-400',
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${className}`}
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
      className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 align-middle text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const INPUT_CLASS =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

export const inputClass = INPUT_CLASS;

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

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && open && !dialog.open) {
      dialog.showModal();
    } else if (dialog && !open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-full max-w-lg rounded-xl bg-white p-0 text-zinc-900 shadow-xl dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="space-y-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button onClick={onClose}>Close</Button>
        </header>
        {open ? children : null}
      </div>
    </dialog>
  );
}
