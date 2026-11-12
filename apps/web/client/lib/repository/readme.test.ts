import { expect, test } from 'bun:test';

import { readmeOf } from './readme';

const file = (path: string): { path: string; type: string } => ({ path, type: 'file' });

test("a folder's README is its Markdown one first, in any case", () => {
  expect(readmeOf([file('docs/readme.txt'), file('docs/README.md'), file('docs/a.md')])?.path).toBe(
    'docs/README.md',
  );
  expect(readmeOf([file('Readme'), file('package.json')])?.path).toBe('Readme');
  expect(readmeOf([{ path: 'README.md', type: 'dir' }, file('index.ts')])).toBeUndefined();
});
