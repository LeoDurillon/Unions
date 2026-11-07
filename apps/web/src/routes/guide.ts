// The user guide, read-only: the pages of `documentation/` and the screenshots they show. Only names read
// from those folders are served, never a path taken from the request.
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { Hono } from 'hono';

import { GUIDE_INDEX, orderPages, pageName, pageTitle } from '../guide-pages';
import type { GuidePage, GuidePageText } from '../guide-types';
import { fail, NOT_FOUND } from '../http';

const ROOT = path.join(import.meta.dir, '../../../..');
const IMAGE_FILE = /^[a-z0-9-]+\.png$/u;

type GuideDirs = { pages: string; images: string };

const DEFAULT_DIRS: GuideDirs = {
  pages: path.join(ROOT, 'documentation'),
  images: path.join(ROOT, 'docs/screenshots'),
};

function files(dir: string): Promise<string[]> {
  return readdir(dir).catch((): string[] => []);
}

async function readPage(dirs: GuideDirs, name: string): Promise<GuidePageText> {
  const names = await files(dirs.pages);
  const known = names.some((file) => pageName(file) === name);
  if (!known) {
    throw fail(NOT_FOUND, `No guide page ${name}`);
  }
  const text = await Bun.file(path.join(dirs.pages, `${name}.md`)).text();
  return { name, title: pageTitle(name, text), text };
}

async function listPages(dirs: GuideDirs): Promise<GuidePage[]> {
  const all = await files(dirs.pages);
  const names = all.flatMap((file) => pageName(file) ?? []);
  const pages = await Promise.all(names.map((name) => readPage(dirs, name)));
  const index = pages.find((page) => page.name === GUIDE_INDEX)?.text ?? '';
  return orderPages(
    pages.map(({ name, title }) => ({ name, title })),
    index,
  );
}

/** `/guide`: the pages in order, `/guide/pages/:name` one page, `/guide/images/:name` a screenshot. */
export function guideRoutes(dirs: GuideDirs = DEFAULT_DIRS): Hono {
  const routes = new Hono();
  routes.get('/', async (c) => c.json({ pages: await listPages(dirs) }));
  routes.get('/pages/:name', async (c) => c.json(await readPage(dirs, c.req.param('name'))));
  routes.get('/images/:name', async (c) => {
    const name = c.req.param('name');
    const images = IMAGE_FILE.test(name) ? await files(dirs.images) : [];
    const known = images.includes(name);
    if (!known) {
      throw fail(NOT_FOUND, `No guide image ${name}`);
    }
    return new Response(Bun.file(path.join(dirs.images, name)), {
      headers: { 'content-type': 'image/png', 'cache-control': 'no-cache' },
    });
  });
  return routes;
}
