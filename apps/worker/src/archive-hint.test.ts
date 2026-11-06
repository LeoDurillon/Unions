// The unzip hint: which attachments get it, and which tools allow its commands.
import { expect, test } from 'bun:test';

import { archiveHint, bashAllows } from './archive-hint';

function file(name: string): { name: string } {
  return { name };
}

const UNZIP = ['Read', 'Bash(unzip -l *)', 'Bash(unzip -p *)'];

test('bash rules allow the commands they start', () => {
  expect(bashAllows(['Bash'], 'unzip -p ')).toBe(true);
  expect(bashAllows(['Bash(unzip *)'], 'unzip -l ')).toBe(true);
  expect(bashAllows(['Bash(unzip:*)'], 'unzip -l ')).toBe(true);
  expect(bashAllows(['Bash(unzip -p *)'], 'unzip -p ')).toBe(true);
  expect(bashAllows(['Bash(unzip -p *)'], 'unzip -l ')).toBe(false);
  expect(bashAllows(['Read', 'Bash(git diff*)'], 'unzip -l ')).toBe(false);
});

test('an attached spreadsheet gets both commands when both are allowed', () => {
  const hint = archiveHint([file('PPC.xlsx'), file('shot.png')], UNZIP);
  expect(hint).toContain('`PPC.xlsx` is a zip archive');
  expect(hint).not.toContain('shot.png');
  expect(hint).toContain('`unzip -l <file>`');
  expect(hint).toContain('`unzip -p <file> <part>`');
  expect(hint).toContain('do not extract');
});

test('only the allowed command is named', () => {
  const hint = archiveHint([file('a.docx'), file('b.ZIP')], ['Bash(unzip -p *)']);
  expect(hint).toContain('`a.docx`, `b.ZIP` are zip archives');
  expect(hint).not.toContain('unzip -l');
});

test('no hint without an archive or an unzip command', () => {
  expect(archiveHint([file('shot.png')], UNZIP)).toBe('');
  expect(archiveHint([file('PPC.xlsx')], ['Read', 'Grep', 'Glob'])).toBe('');
});
