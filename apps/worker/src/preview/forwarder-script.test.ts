import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FORWARDER_SCRIPT } from './forwarder-script';

const PID_WAIT_MS = 5000;
const POLL_MS = 20;

let dir = '';
let child: ReturnType<typeof Bun.spawn> | null = null;
const services: { stop: (force: boolean) => unknown }[] = [];

afterEach(async () => {
  child?.kill();
  child = null;
  for (const server of services.splice(0)) {
    server.stop(true);
  }
  if (dir !== '') {
    await rm(dir, { recursive: true, force: true });
  }
});

/** An HTTP service on a free port of 127.0.0.1 that answers with its name and the host it was asked for. */
function service(name: string): number {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) => new Response(`${name} ${request.headers.get('host') ?? ''}`),
  });
  services.push(server);
  return server.port ?? 0;
}

/** A port nothing listens on: the system's pick, released at once. */
function freePort(): number {
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() });
  const port = server.port ?? 0;
  void server.stop(true);
  return port;
}

async function startForwarder(spec: unknown): Promise<void> {
  dir = await mkdtemp(path.join(tmpdir(), 'union-forwarder-'));
  const base = path.join(dir, 'f');
  await writeFile(`${base}.mjs`, FORWARDER_SCRIPT);
  await writeFile(`${base}.json`, JSON.stringify(spec));
  child = Bun.spawn(['node', `${base}.mjs`, `${base}.json`, base], { stderr: 'inherit' });
  const deadline = Date.now() + PID_WAIT_MS;
  while (Date.now() < deadline) {
    const ready = await readFile(`${base}.pid`, 'utf8').catch(() => null);
    if (ready !== null) {
      expect(await readFile(`${base}.skipped`, 'utf8')).toBe('');
      return;
    }
    await Bun.sleep(POLL_MS);
  }
  throw new Error('The forwarder did not start');
}

/**
 * A request through the forwarder for `host`, as a browser sends it (the port in `Host`), on a
 * connection of its own: a browser keeps one per host, the forwarder routes a connection by its
 * first request.
 */
async function ask(port: number, host: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { host: `${host}:${port}`, connection: 'close' },
  });
  return { status: response.status, body: await response.text() };
}

test('the preview router sends each host to its service, keeping the host the browser asked for', async () => {
  const api = service('api');
  const web = service('web');
  const port = freePort();
  await startForwarder({
    port,
    hosts: {
      'api-t12.union.localhost': { service: '127.0.0.1', port: api },
      't12.union.localhost': { service: '127.0.0.1', port: web },
    },
  });
  expect(await ask(port, 'api-t12.union.localhost')).toEqual({
    status: 200,
    body: `api api-t12.union.localhost:${port}`,
  });
  expect(await ask(port, 'T12.union.localhost')).toEqual({
    status: 200,
    body: `web T12.union.localhost:${port}`,
  });
  // Another preview's host is not served from this container.
  expect((await ask(port, 'api-t13.union.localhost')).status).toBe(404);
});

test('plain forwards still pipe each port to its service', async () => {
  const api = service('api');
  const port = freePort();
  await startForwarder([{ service: '127.0.0.1', port, targetPort: api }]);
  const response = await fetch(`http://127.0.0.1:${port}/`);
  expect(await response.text()).toBe(`api 127.0.0.1:${port}`);
});
