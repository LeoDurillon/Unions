// Tests of the note a failure gets when its process was killed: exit 137 names the memory limit and where to raise it.
import { expect, test } from 'bun:test';

import { killedNote } from './container-exec';

test('exit 137 says the process was most likely out of memory, and where to raise the limit', () => {
  expect(killedNote(137)).toContain('more memory than its container may');
  expect(killedNote(137)).toContain('Union settings → Resources');
  expect(killedNote(1)).toBe('');
  expect(killedNote(0)).toBe('');
});
