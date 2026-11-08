// Tests of the API's request guard: only Union's own page, on a loopback host, with a body it sends.
import { expect, test } from 'bun:test';

import { Hono } from 'hono';

import { allowedHosts, requestGuard } from './request-guard';

const PAGE = 'http://localhost:5173';

function guarded(hosts = allowedHosts({})): Hono {
  const app = new Hono();
  app.use('/api/*', requestGuard(hosts));
  app.all('/api/*', (c) => c.json({ ok: true }));
  return app;
}

function send(url: string, init: RequestInit = {}): Promise<Response> | Response {
  return guarded().request(new Request(url, init));
}

const JSON_POST: RequestInit = {
  method: 'POST',
  headers: { origin: PAGE, 'content-type': 'application/json' },
  body: '{}',
};

test("the page's own requests pass: reads, JSON, uploads, bodiless writes", async () => {
  expect((await send(`${PAGE}/api/projects`)).status).toBe(200);
  expect((await send(`${PAGE}/api/events?after=latest`)).status).toBe(200);
  expect((await send(`${PAGE}/api/tickets/1`, JSON_POST)).status).toBe(200);
  const form = new FormData();
  form.append('file', new Blob(['x']), 'a.png');
  expect(
    (await send(`${PAGE}/api/tickets/1/attachments`, { method: 'POST', body: form })).status,
  ).toBe(200);
  const bytes = { 'content-type': 'application/octet-stream', origin: PAGE };
  expect((await send(`${PAGE}/api/x`, { method: 'PUT', headers: bytes, body: 'x' })).status).toBe(
    200,
  );
  expect(
    (await send(`${PAGE}/api/x`, { method: 'DELETE', headers: { origin: PAGE } })).status,
  ).toBe(200);
  expect((await send('http://127.0.0.1:3000/api/projects')).status).toBe(200);
});

test('another host is refused: DNS rebinding, the Docker gateway, the LAN', async () => {
  for (const url of [
    'http://evil.example:5173/api/projects',
    'http://172.17.0.1:5173/api/projects',
    'http://192.168.1.20:5173/api/projects',
    'http://t5.union.localhost:5173/api/projects',
  ]) {
    const response = await send(url);
    expect(response.status).toBe(403);
  }
});

test('another origin is refused, previews and other local ports included', async () => {
  for (const origin of [
    'https://evil.example',
    'http://t5.union.localhost:8080',
    'http://localhost:8080',
    'null',
  ]) {
    const response = await send(`${PAGE}/api/tickets/1`, {
      ...JSON_POST,
      headers: { origin, 'content-type': 'application/json' },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Requests from other sites are refused' });
  }
});

test('a write whose body a browser sends cross-site without asking is refused', async () => {
  for (const type of [
    'text/plain',
    'application/x-www-form-urlencoded',
    'text/plain;charset=UTF-8',
  ]) {
    const response = await send(`${PAGE}/api/tickets/1`, {
      method: 'POST',
      headers: { 'content-type': type },
      body: '{"command":"id"}',
    });
    expect(response.status).toBe(415);
  }
});

test('UNION_ALLOWED_HOSTS adds host names', async () => {
  const hosts = allowedHosts({ UNION_ALLOWED_HOSTS: ' Desk.lan , ' });
  expect([...hosts]).toEqual(['localhost', '127.0.0.1', '[::1]', 'desk.lan']);
  const response = await guarded(hosts).request(new Request('http://desk.lan:5173/api/projects'));
  expect(response.status).toBe(200);
});
