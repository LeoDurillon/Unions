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

/** An event stream for `/events`, else the service's name, the path it got, the forwarded prefix and host. */
function answer(name: string, request: Request): Response {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/events')) {
    return eventStream();
  }
  const prefix = request.headers.get('x-forwarded-prefix') ?? '-';
  const forwardedHost = request.headers.get('x-forwarded-host') ?? '-';
  return new Response(`${name} ${url.pathname}${url.search} ${prefix} ${forwardedHost}\n`);
}

/** A service that answers with its name, the path it got and the forwarded prefix and host. */
function echo(name: string): number {
  const server = Bun.serve<string>({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request, bun) =>
      new URL(request.url).pathname.endsWith('/socket') && bun.upgrade(request, { data: name })
        ? undefined
        : answer(name, request),
    websocket: {
      message: (socket, message) => {
        socket.send(`${socket.data}: ${String(message)}`);
      },
    },
  });
  services.push(server);
  return server.port ?? 0;
}

const EVENT_GAP_MS = 300;

/** Three events, `EVENT_GAP_MS` apart. */
function eventStream(): Response {
  let sent = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      await Bun.sleep(EVENT_GAP_MS);
      controller.enqueue(new TextEncoder().encode(`data: ${sent}\n\n`));
      sent += 1;
      if (sent === 3) {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
}

async function startWithPaths(): Promise<number> {
  const web = echo('web');
  const api = echo('api');
  const v2 = echo('v2');
  const port = freePort();
  await startForwarder({
    port,
    hosts: {
      't12.union.localhost': {
        service: '127.0.0.1',
        port: web,
        paths: [
          { path: '/api/v2', strip: false, service: '127.0.0.1', port: v2 },
          { path: '/api', strip: true, service: '127.0.0.1', port: api },
        ],
      },
      'api-t12.union.localhost': { service: '127.0.0.1', port: api },
    },
  });
  return port;
}

/**
 * Requests sent one after the other on one connection, as a browser keeps it open (`host path`, or
 * a path on `t12.union.localhost`): the whole reply.
 */
async function onOneConnection(port: number, paths: string[]): Promise<string> {
  const requests = paths.map((asked, index) => {
    const [host, requestPath] = asked.includes(' ')
      ? asked.split(' ')
      : ['t12.union.localhost', asked];
    const close = index === paths.length - 1 ? 'connection: close\r\n' : '';
    return `GET ${requestPath} HTTP/1.1\r\nhost: ${host}:${port}\r\n${close}\r\n`;
  });
  const chunks: string[] = [];
  const { promise, resolve } = Promise.withResolvers<string>();
  await Bun.connect({
    hostname: '127.0.0.1',
    port,
    socket: {
      open: (socket) => {
        socket.write(requests.join(''));
      },
      data: (_socket, data) => {
        chunks.push(data.toString());
      },
      close: () => {
        resolve(chunks.join(''));
      },
    },
  });
  return promise;
}

test('on a host with paths, each request of one connection goes where its path says', async () => {
  const port = await startWithPaths();
  const host = `t12.union.localhost:${port}`;
  const reply = await onOneConnection(port, ['/', '/api/users?x=1', '/api', '/apis', '/api/v2/a']);
  const bodies = [...reply.matchAll(/^(?:web|api|v2) .*$/gmu)].map((match) => match[0]);
  expect(bodies).toEqual([
    `web / - ${host}`,
    `api /users?x=1 /api ${host}`,
    `api / /api ${host}`,
    `web /apis - ${host}`,
    `v2 /api/v2/a - ${host}`,
  ]);
});

test('a connection reused for another host routes each request by its own host', async () => {
  const port = await startWithPaths();
  const reply = await onOneConnection(port, [
    '/api/a',
    'api-t12.union.localhost /b',
    'api-t13.union.localhost /c',
    '/d',
  ]);
  const bodies = [...reply.matchAll(/^(?:web|api) .*$/gmu)].map((match) => match[0].split(' ')[0]);
  expect(bodies).toEqual(['api', 'api', 'web']);
  // Another preview's host on the same connection: not served from this container.
  expect(reply).toContain('HTTP/1.1 404');
});

test('an event stream through a path arrives event by event', async () => {
  const port = await startWithPaths();
  const response = await fetch(`http://127.0.0.1:${port}/api/events`, {
    headers: { host: `t12.union.localhost:${port}` },
  });
  const reader = response.body?.getReader();
  const started = Date.now();
  const first = await reader?.read();
  expect(new TextDecoder().decode(first?.value)).toBe('data: 0\n\n');
  // The first event comes alone, before the stream ends.
  expect(Date.now() - started).toBeLessThan(EVENT_GAP_MS * 2);
  await reader?.cancel();
});

test('a websocket through a path is piped to the service, the path removed', async () => {
  const port = await startWithPaths();
  const options: Bun.WebSocketOptions = { headers: { host: `t12.union.localhost:${port}` } };
  // The DOM's types hide Bun's constructor, which takes the headers.
  const BunWebSocket = WebSocket as unknown as new (
    url: string,
    init: Bun.WebSocketOptions,
  ) => WebSocket;
  const socket = new BunWebSocket(`ws://127.0.0.1:${port}/api/socket`, options);
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  socket.addEventListener('open', () => {
    socket.send('hello');
  });
  socket.addEventListener('message', (event) => {
    resolve(String(event.data));
  });
  socket.addEventListener('error', () => {
    reject(new Error('The websocket failed'));
  });
  expect(await promise).toBe('api: hello');
  socket.close();
});

test('a path whose service is not up answers 502', async () => {
  const port = freePort();
  const web = echo('web');
  await startForwarder({
    port,
    hosts: {
      't12.union.localhost': {
        service: '127.0.0.1',
        port: web,
        paths: [{ path: '/api', strip: true, service: '127.0.0.1', port: freePort() }],
      },
    },
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/x`, {
    headers: { host: `t12.union.localhost:${port}`, connection: 'close' },
  });
  expect(response.status).toBe(502);
});
