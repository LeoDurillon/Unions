// A destructive action that asks first: a quiet red button, then the question with confirm and keep.
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { useDismiss } from '../../lib/ui/use-dismiss';
import { IconButton } from './icon-button';
import { Button } from './ui';

/** The button before the question: an icon for a row action, else quiet red text. */
function Trigger({
  label,
  name,
  icon,
  wide,
  disabled,
  onClick,
}: {
  label: string;
  name: string | undefined;
  icon: ReactNode;
  wide: boolean;
  disabled: boolean;
  onClick: () => void;
}): ReactElement {
  if (icon !== null) {
    return (
      <IconButton label={name ?? label} danger disabled={disabled} onClick={onClick}>
        {icon}
      </IconButton>
    );
  }
  return (
    <Button
      variant="quietDanger"
      aria-label={name}
      className={wide ? 'w-full text-left' : ''}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/**
 * A destructive action that asks first: a quiet red button, then the question with confirm and keep.
 * While it asks, "Keep it" has the focus, and Escape or a press outside keeps.
 */
export function ConfirmButton({
  label,
  name,
  question,
  confirmLabel,
  disabled = false,
  icon = null,
  wide = false,
  onConfirm,
}: {
  /** The button's text, or its accessible name when `icon` is set. */
  label: string;
  /** The accessible name when `label` alone does not say what goes ("Remove" on every row). */
  name?: string;
  question: string;
  confirmLabel: string;
  disabled?: boolean;
  /** Shows an icon-only button (a row action) instead of the quiet red one. */
  icon?: ReactNode;
  /** Fills its row, text on the left: an item of a ⋯ menu. */
  wide?: boolean;
  onConfirm: () => void;
}): ReactElement {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Trigger
        label={label}
        name={name}
        icon={icon}
        wide={wide}
        disabled={disabled}
        onClick={() => {
          setAsking(true);
        }}
      />
    );
  }
  return (
    <Question
      question={question}
      confirmLabel={confirmLabel}
      disabled={disabled}
      onConfirm={() => {
        setAsking(false);
        onConfirm();
      }}
      onKeep={() => {
        setAsking(false);
      }}
    />
  );
}

/** The question, with "Keep it" focused; Escape or a press outside keeps. */
function Question({
  question,
  confirmLabel,
  disabled,
  onConfirm,
  onKeep,
}: {
  question: string;
  confirmLabel: string;
  disabled: boolean;
  onConfirm: () => void;
  onKeep: () => void;
}): ReactElement {
  const root = useRef<HTMLSpanElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useDismiss(root, onKeep);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <span ref={root} className="flex flex-wrap items-center gap-2 text-sm">
      <span>{question}</span>
      <Button variant="danger" disabled={disabled} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button ref={keep} onClick={onKeep}>
        Keep it
      </Button>
    </span>
  );
}
