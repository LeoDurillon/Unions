// A destructive action that asks first: a quiet red button, then the question with confirm and keep.
import { useState, type ReactElement, type ReactNode } from 'react';

import { IconButton } from './icon-button';
import { Button } from './ui';

/** The button before the question: an icon for a row action, else quiet red text. */
function Trigger({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}): ReactElement {
  if (icon !== null) {
    return (
      <IconButton label={label} danger disabled={disabled} onClick={onClick}>
        {icon}
      </IconButton>
    );
  }
  return (
    <Button variant="quietDanger" disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );
}

/** A destructive action that asks first: a quiet red button, then the question with confirm and keep. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  disabled = false,
  icon = null,
  onConfirm,
}: {
  /** The button's text, or its accessible name when `icon` is set. */
  label: string;
  question: string;
  confirmLabel: string;
  disabled?: boolean;
  /** Shows an icon-only button (a row action) instead of the quiet red one. */
  icon?: ReactNode;
  onConfirm: () => void;
}): ReactElement {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Trigger
        label={label}
        icon={icon}
        disabled={disabled}
        onClick={() => {
          setAsking(true);
        }}
      />
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span>{question}</span>
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button
        onClick={() => {
          setAsking(false);
        }}
      >
        Keep it
      </Button>
    </span>
  );
}
