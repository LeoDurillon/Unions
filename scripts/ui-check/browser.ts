// Opens the running app in a headless browser for UI checks, with API writes blocked or stubbed, and recorded.
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { chromium, type Page, type Route } from 'playwright-core';

export const APP_URL = process.env.UNION_UI_URL ?? 'http://localhost:5173';

const SHELL = path.join('chrome-headless-shell-linux64', 'chrome-headless-shell');

/** Chromium's headless shell (`UNION_CHROMIUM`, else the newest under `~/.cache/ms-playwright`). */
async function chromiumPath(): Promise<string> {
  if (process.env.UNION_CHROMIUM) {
    return process.env.UNION_CHROMIUM;
  }
  const cache = path.join(homedir(), '.cache', 'ms-playwright');
  const entries = await readdir(cache).catch((): string[] => []);
  const newest = entries
    .filter((name) => name.startsWith('chromium_headless_shell-'))
    .toSorted()
    .at(-1);
  if (!newest) {
    throw new Error(
      'No headless Chromium: run `bunx playwright-core install chromium-headless-shell`, or set UNION_CHROMIUM',
    );
  }
  return path.join(cache, newest, SHELL);
}

/** A request the page made that would change something. */
export type Write = { method: string; path: string; body: string | null };

/**
 * Answers an API request itself (stubbed data, a fake success); returns false to let it through
 * (a GET) or block it (a write).
 */
export type Stub = (route: Route, apiPath: string, method: string) => Promise<boolean>;

const BLOCKED = 400;
const VIEWPORT = { width: 1400, height: 1000 };

/**
 * The app in a fresh page. GETs reach the live API unless `stub` answers them; writes never do:
 * they are recorded in `writes` and answered by `stub`, else refused.
 */
export async function openApp(
  options: { stub?: Stub; width?: number; height?: number } = {},
): Promise<{ page: Page; writes: Write[]; close: () => Promise<void> }> {
  const browser = await chromium.launch({ executablePath: await chromiumPath() });
  const page = await browser.newPage({
    viewport: {
      width: options.width ?? VIEWPORT.width,
      height: options.height ?? VIEWPORT.height,
    },
  });
  const writes: Write[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const apiPath = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== 'GET') {
      writes.push({ method, path: apiPath, body: request.postData() });
    }
    if (options.stub && (await options.stub(route, apiPath, method))) {
      return;
    }
    await (method === 'GET'
      ? route.continue()
      : route.fulfill({ status: BLOCKED, json: { error: 'Blocked by the UI check' } }));
  });
  await page.goto(APP_URL);
  return { page, writes, close: () => browser.close() };
}

/** Opens a ticket's panel from the board by its card's title. */
export async function openTicket(page: Page, title: string): Promise<void> {
  await page.getByText(title).first().click();
}
