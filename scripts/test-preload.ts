// Runs before every test file (`bunfig.toml`): points attachments at a temporary folder, never the live one.
import { afterAll } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Without it, a test that removes project 1 or ticket 1 deletes the real `attachments/p1` or `t1`.
const root = await mkdtemp(path.join(tmpdir(), 'union-test-attachments-'));
process.env.UNION_ATTACHMENTS_DIR = root;

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
