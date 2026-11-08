// Tests that the self-update runs from Union's own checkout: its root is the folder that holds AGENTS.md and the workspaces.
import { expect, test } from 'bun:test';
import path from 'node:path';

import { UNION_ROOT } from './union-update-git';

test("Union's root is the repository's, wherever this file sits", async () => {
  expect(await Bun.file(path.join(UNION_ROOT, 'AGENTS.md')).exists()).toBe(true);
  expect(await Bun.file(path.join(UNION_ROOT, 'apps', 'worker', 'package.json')).exists()).toBe(
    true,
  );
});
