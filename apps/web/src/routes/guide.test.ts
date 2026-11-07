import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { guideRoutes } from './guide';

const OK = 200;
const NOT_FOUND = 404;

let root = '';

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-guide-'));
  await mkdir(path.join(root, 'documentation'));
  await mkdir(path.join(root, 'docs/screenshots'), { recursive: true });
  await writeFile(path.join(root, 'documentation/README.md'), '# Guide\n[B](b.md) [A](a.md)');
  await writeFile(path.join(root, 'documentation/a.md'), '# Page A\ntext');
  await writeFile(path.join(root, 'documentation/b.md'), '# Page B');
  await writeFile(path.join(root, 'documentation/notes.txt'), 'not a page');
  await writeFile(path.join(root, 'AGENTS.md'), '# Outside the guide');
  await writeFile(path.join(root, 'docs/screenshots/board.png'), 'png');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function routes(): ReturnType<typeof guideRoutes> {
  return guideRoutes({
    pages: path.join(root, 'documentation'),
    images: path.join(root, 'docs/screenshots'),
  });
}

describe('guide routes', () => {
  test('lists the pages in the index order', async () => {
    const response = await routes().request('/');
    expect(await response.json()).toEqual({
      pages: [
        { name: 'README', title: 'Guide' },
        { name: 'b', title: 'Page B' },
        { name: 'a', title: 'Page A' },
      ],
    });
  });

  test('serves a page and its title', async () => {
    const response = await routes().request('/pages/a');
    expect(await response.json()).toEqual({ name: 'a', title: 'Page A', text: '# Page A\ntext' });
  });

  test('refuses names that are not pages of the folder', async () => {
    for (const name of ['missing', 'notes', '..%2FAGENTS', '%2E%2E%2FAGENTS']) {
      const response = await routes().request(`/pages/${name}`);
      expect(response.status).toBe(NOT_FOUND);
    }
  });

  test('serves a screenshot, nothing else', async () => {
    const image = await routes().request('/images/board.png');
    expect(image.status).toBe(OK);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect((await routes().request('/images/other.png')).status).toBe(NOT_FOUND);
    expect((await routes().request('/images/..%2F..%2FAGENTS.md')).status).toBe(NOT_FOUND);
  });

  test('reads the real guide by default', async () => {
    const response = await guideRoutes().request('/pages/first-project');
    expect(response.status).toBe(OK);
  });
});
