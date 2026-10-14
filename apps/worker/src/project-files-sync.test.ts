import { afterAll, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
} from '@union/core';

import { syncProjectFiles } from './project-files-sync';
import { projectFilesSection } from './prompts';

const root = await mkdtemp(path.join(tmpdir(), 'union-project-files-sync-'));
process.env.UNION_ATTACHMENTS_DIR = root;

let db: Db;
let projectId: number;
/** What the workspace answers to the inspection: `OLD <path>` and `HAS <sha256>  <path>` lines. */
let workspace: string[];
let scripts: string[];
let copies: { hostPath: string; volumePath: string }[][];

const runtime = {
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    const body = spec.command[2] ?? '';
    scripts.push(body);
    if (body.includes('sha256sum') || body.includes('NOREPO')) {
      yield* workspace;
    }
    return { exitCode: 0, stderr: '' };
  },
  copyIntoVolume: (
    _volume: string,
    _image: string,
    files: { hostPath: string; volumePath: string }[],
  ) => {
    copies.push(files);
    return Promise.resolve();
  },
} as unknown as ContainerRuntime;

function addFile(filePath: string, sha256: string): number {
  return db
    .insert(schema.projectFiles)
    .values({ projectId, path: filePath, size: 4, sha256, blobId: 'b' })
    .returning()
    .get().id;
}

function sync(): Promise<void> {
  return syncProjectFiles(db, runtime, projectId, { volume: 'union-t1-ws', image: 'helper' });
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  workspace = [];
  scripts = [];
  copies = [];
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test('a new file is copied to its path, its folders made, and git told to ignore it', async () => {
  const id = addFile('dev/data/goreno.sql', 'aaa');
  await sync();
  expect(copies).toEqual([
    [
      {
        hostPath: path.join(root, `p${projectId}`, String(id)),
        volumePath: 'repo/dev/data/goreno.sql',
      },
    ],
  ]);
  expect(scripts[1]).toContain("mkdir 'dev/data'");
  expect(scripts[2]).toContain("echo '/dev/data/goreno.sql' >> .git/info/exclude");
  expect(scripts[2]).toContain(
    String.raw`printf '%s\n' 'dev/data/goreno.sql' > .git/union-project-files`,
  );
});

test('a workspace already holding the same content is left alone', async () => {
  addFile('goreno.sql', 'aaa');
  workspace = ['OLD goreno.sql', 'HAS aaa  goreno.sql'];
  await sync();
  expect(scripts).toHaveLength(1);
  expect(copies).toEqual([]);
});

test('a changed file is copied again; a removed one disappears from the workspace', async () => {
  addFile('goreno.sql', 'new');
  workspace = ['OLD goreno.sql', 'OLD old.env', 'HAS old  goreno.sql'];
  await sync();
  expect(copies.flat().map((file) => file.volumePath)).toEqual(['repo/goreno.sql']);
  expect(scripts[1]).toContain("rm -f 'old.env'");
});

test('without a repository yet there is nothing to do', async () => {
  addFile('goreno.sql', 'aaa');
  workspace = ['NOREPO'];
  await sync();
  expect(scripts).toHaveLength(1);
  expect(copies).toEqual([]);
});

test('the agents are told where the project files are and not to commit them', () => {
  const section = projectFilesSection([
    {
      id: 1,
      projectId: 1,
      path: 'goreno.sql',
      size: 2048,
      sha256: 's',
      blobId: 'b',
      createdAt: 0,
      updatedAt: 0,
    },
  ]);
  expect(section).toContain('- `goreno.sql` (2.0 KB)');
  expect(section).toContain('Never commit them');
});
