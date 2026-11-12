// "Copy as markdown": puts a text on the clipboard, and says "Copied" for a moment.

import { useState, type ReactElement } from 'react';

import { Button } from '../ui/ui';

const COPIED_MS = 2000;

/** `text` is read when clicked, so a long one is only built then. */
export function CopyMarkdownButton({ text }: { text: () => string }): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(text());
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);
  };
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void copy();
      }}
    >
      {copied ? 'Copied' : 'Copy as markdown'}
    </Button>
  );
}
