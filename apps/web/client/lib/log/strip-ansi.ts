// Removes the terminal's colour and cursor codes from output shown as plain text.
const ESCAPE = '\u001B';
/** CSI sequences (`ESC [ … letter`, colours among them) and the two-byte escapes. */
const ANSI = new RegExp(String.raw`${ESCAPE}(?:\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])`, 'gu');

export function stripAnsi(text: string): string {
  return text.replaceAll(ANSI, '');
}
