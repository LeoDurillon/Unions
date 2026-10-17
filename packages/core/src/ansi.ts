// Strips terminal colour codes from command and CI output; browser-safe.

// oxlint-disable-next-line no-control-regex -- the escape character starts the colour codes
const ANSI = /\u001B\[[\d;?]*[\dA-Za-z]|\u001B\][^\u0007]*\u0007/gu;

/** The text without its colour and terminal title codes. */
export function stripAnsi(text: string): string {
  return text.replaceAll(ANSI, '');
}
