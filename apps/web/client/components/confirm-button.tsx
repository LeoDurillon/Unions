// A destructive action that asks first: a quiet red button, then the question with confirm and keep.
import { useState, type ReactElement } from 'react';

import { Button } from './ui';

/** A destructive action that asks first: a quiet red button, then the question with confirm and keep. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  disabled = false,
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
}): ReactElement {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        variant="quietDanger"
        disabled={disabled}
        onClick={() => {
          setAsking(true);
        }}
      >
        {label}
      </Button>
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
