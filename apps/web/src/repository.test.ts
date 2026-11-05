// Tests the Repository tab's routes over a fake GitHub, and the cache of trees and files.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { RepositoryGitHub } from './github-repository';
import type { RepositoryTree } from './repository-api-types';
import { CachedRepository } from './repository-cache';
import { WeightedLru } from './weighted-lru';

const COMMIT = 'a'.repeat(40);
const ROOT = 'b'.repeat(40);
const README = 'c'.repeat(40);
const SRC = 'd'.repeat(40);

const TREE: RepositoryTree = {
  entries: [
    { path: 'README.md', type: 'file', size: 6, sha: README },
    { path: 'src', type: 'dir', size: null, sha: SRC },
  ],
  truncated: false,
};

let calls: string[] = [];

const fake: RepositoryGitHub = {
  resolveCommit: (_auth, _repo, ref) => {
    calls.push(`commit ${ref}`);
    if (ref === 'gone') {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      sha: COMMIT,
      treeSha: ROOT,
      message: 'Add things',
      author: 'Ada',
      date: '2026-11-05T10:00:00Z',
      url: `https://github.com/acme/shop/commit/${COMMIT}`,
    });
  },
  getTree: (_auth, _repo, read) => {
    calls.push(`tree ${read.sha.slice(0, 1)} ${read.prefix ?? '-'}`);
    return Promise.resolve(read.sha === ROOT || read.sha === SRC ? TREE : null);
  },
  getBlob: (_auth, _repo, sha) => {
    calls.push(`blob ${sha.slice(0, 1)}`);
    return Promise.resolve(sha === README ? new TextEncoder().encode('# Shop') : null);
  },
};

let db: Db;
let app: Hono;
let projectId: number;

beforeEach(() => {
  calls = [];
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, undefined, undefined, { repository: new CachedRepository(fake) });
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'develop' } })
    .returning()
    .get().id;
});

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await app.request(`/api/projects/${projectId}/repository/${path}`);
  return { status: response.status, body: await response.json() };
}

test('the commit defaults to the base branch', async () => {
  const { status, body } = await get('commit');
  expect(status).toBe(200);
  expect(body).toMatchObject({ ref: 'develop', sha: COMMIT, treeSha: ROOT });
  expect(calls).toEqual(['commit develop']);
});

test('a ref that names nothing is a 404', async () => {
  const { status } = await get('commit?ref=gone');
  expect(status).toBe(404);
});

test('the tree is read once, then kept', async () => {
  expect((await get(`tree?sha=${ROOT}`)).body).toEqual(TREE);
  await get(`tree?sha=${ROOT}`);
  await get(`tree?sha=${SRC}&prefix=src`);
  expect(calls).toEqual(['tree b -', 'tree d src']);
});

test('a short sha or an escaping prefix is refused', async () => {
  expect((await get('tree?sha=abc')).status).toBe(400);
  expect((await get(`tree?sha=${SRC}&prefix=../x`)).status).toBe(400);
  expect((await get(`tree?sha=${SRC}&prefix=src/`)).status).toBe(400);
  expect(calls).toEqual([]);
});

test('a file comes back as text, read once', async () => {
  const first = await get(`blob?sha=${README}&path=README.md`);
  expect(first.body).toEqual({ kind: 'text', size: 6, text: '# Shop' });
  await get(`blob?sha=${README}&path=README.md`);
  expect(calls).toEqual(['blob c']);
  expect((await get(`blob?sha=${SRC}`)).status).toBe(404);
});

test('a file the tree says is too large is not read', async () => {
  const { body } = await get(`blob?sha=${README}&path=big.json&size=5000000`);
  expect(body).toEqual({ kind: 'too-large', size: 5_000_000 });
  expect(calls).toEqual([]);
});

test('without credentials the reads are refused', async () => {
  db.update(schema.projects).set({ githubToken: null }).run();
  const saved = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    expect((await get('commit')).status).toBe(409);
  } finally {
    if (saved !== undefined) {
      process.env.GITHUB_TOKEN = saved;
    }
  }
});

test('the cache drops the least recently used past its weight', () => {
  const lru = new WeightedLru<string>(5, (value) => value.length);
  lru.set('a', 'aa');
  lru.set('b', 'bb');
  expect(lru.get('a')).toBe('aa');
  lru.set('c', 'cc');
  expect(lru.get('b')).toBeUndefined();
  expect(lru.get('a')).toBe('aa');
  lru.set('big', 'xxxxxx');
  expect(lru.get('big')).toBeUndefined();
});

test('an image is served as its bytes, with its type and a sandbox', async () => {
  const response = await app.request(
    `/api/projects/${projectId}/repository/raw?sha=${README}&path=docs/logo.svg`,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/svg+xml');
  expect(response.headers.get('content-security-policy')).toBe('sandbox');
  expect(await response.text()).toBe('# Shop');
});

test('only images are served raw, and not past their limit', async () => {
  expect((await get(`raw?sha=${README}&path=README.md`)).status).toBe(400);
  expect((await get(`raw?sha=${README}&path=a.png&size=20000000`)).status).toBe(413);
  expect(calls).toEqual([]);
});
