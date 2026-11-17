// The Node script that forwards ports in an owner's container: plain ports, or HTTP by host name.
// A host with paths on it is proxied request by request, so its paths reach their own services.

/**
 * Run as `node script.mjs <spec.json> <base>`. The spec is either a list of ports, each piped to its
 * service (`[{ service, port, targetPort }]`), or one port routed by the request's host name
 * (`{ port, hosts: { "<host>": { service, port, paths? } } }`): the browser in the container reaches
 * the preview at the addresses it has outside, cookies included. A host with `paths` (longest first,
 * `{ path, strip, service, port }`) is proxied request by request as Union's proxy does: the path
 * removed when `strip` is set, the `X-Forwarded-*` headers added, bodies streamed (server-sent
 * events), upgrades (websockets) piped. Listens on `127.0.0.1` and `::1`
 * (Node resolves `localhost` to `::1` first) and connects to the service only then: the service
 * need not be up yet (a client then gets a reset, not a refusal: a port check passes before the
 * service is ready). A port it cannot take is written to `<base>.skipped`; the pid file, written
 * last, says it is ready.
 */
export const FORWARDER_SCRIPT = `import net from 'node:net';
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const base = process.argv[3];
const MAX_HEAD = 65536;
const NOT_FOUND = 'HTTP/1.1 404 Not Found\\r\\ncontent-length: 0\\r\\nconnection: close\\r\\n\\r\\n';
const skipped = [];
const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);

function pipeTo(client, service, port, head) {
  const upstream = net.connect(port, service);
  let connected = false;
  upstream.once('connect', () => { connected = true; });
  // The service is not up: a reset, as near as a listening port gets to a refusal.
  const end = () => {
    if (connected || client.destroyed) { client.destroy(); } else { client.resetAndDestroy(); }
    upstream.destroy();
  };
  client.on('error', end);
  upstream.on('error', end);
  if (head) { upstream.write(head); }
  client.pipe(upstream);
  upstream.pipe(client);
  client.on('close', end);
  upstream.on('close', end);
}

// Where a request on a host with paths goes: the longest path it is at or below, else the host's own service.
function pick(entry, url) {
  const query = url.indexOf('?');
  const pathname = query === -1 ? url : url.slice(0, query);
  for (const p of entry.paths ?? []) {
    if (pathname === p.path || pathname.startsWith(p.path + '/')) {
      const rest = p.strip ? url.slice(p.path.length) : url;
      return { service: p.service, port: p.port, url: rest.startsWith('/') ? rest : '/' + rest, prefix: p.strip ? p.path : null };
    }
  }
  return { service: entry.service, port: entry.port, url, prefix: null };
}

function withoutHop(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !HOP.has(key)));
}

// As Union's proxy sends them: the host asked for, and the path removed when one was.
function forwarded(req, prefix) {
  const headers = withoutHop(req.headers);
  delete headers['x-forwarded-prefix'];
  headers['x-forwarded-host'] = req.headers.host ?? '';
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-for'] = req.socket.remoteAddress ?? '127.0.0.1';
  if (prefix) { headers['x-forwarded-prefix'] = prefix; }
  return headers;
}

// Each request by its own host: a client may reuse the connection for another one.
function entryOf(req) {
  const host = /^([^:]+)/.exec(req.headers.host ?? '')?.[1]?.toLowerCase();
  return host ? spec.hosts[host] : undefined;
}

const byRequest = http.createServer((req, res) => {
  const entry = entryOf(req);
  if (!entry) { res.writeHead(404, { 'content-length': '0' }); res.end(); return; }
  const target = pick(entry, req.url ?? '/');
  const upstream = http.request(
    { host: target.service, port: target.port, method: req.method, path: target.url, headers: forwarded(req, target.prefix) },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.statusMessage, withoutHop(answer.headers));
      // Sent now: an event stream may wait before its first event.
      res.flushHeaders();
      answer.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) { res.writeHead(502, { 'content-length': '0' }); }
    res.end();
  });
  res.on('close', () => { if (!res.writableFinished) { upstream.destroy(); } });
  req.pipe(upstream);
});
byRequest.requestTimeout = 0;
byRequest.on('upgrade', (req, socket, head) => {
  const entry = entryOf(req);
  if (!entry) { socket.end(NOT_FOUND); return; }
  const target = pick(entry, req.url ?? '/');
  const headers = { ...forwarded(req, target.prefix), connection: 'Upgrade', upgrade: req.headers.upgrade };
  const lines = [req.method + ' ' + target.url + ' HTTP/1.1'];
  for (const [key, value] of Object.entries(headers)) {
    for (const one of [].concat(value)) { lines.push(key + ': ' + one); }
  }
  const start = Buffer.from(lines.join('\\r\\n') + '\\r\\n\\r\\n', 'latin1');
  pipeTo(socket, target.service, target.port, Buffer.concat([start, head]));
});

// A browser keeps one connection per host: the first request's host routes the whole connection,
// piped as it is, or handed to the request-by-request proxy when the host has paths.
function route(client) {
  let head = Buffer.alloc(0);
  const onData = (chunk) => {
    head = Buffer.concat([head, chunk]);
    const end = head.indexOf('\\r\\n\\r\\n');
    if (end === -1 && head.length < MAX_HEAD) { return; }
    client.off('data', onData);
    client.pause();
    const lines = head.subarray(0, end === -1 ? head.length : end).toString('latin1');
    const host = /^host:[ \\t]*([^\\s:]+)/im.exec(lines)?.[1]?.toLowerCase();
    const target = host ? spec.hosts[host] : undefined;
    if (!target) { client.end(NOT_FOUND); return; }
    if (!target.paths?.length) { pipeTo(client, target.service, target.port, head); return; }
    client.unshift(head);
    byRequest.emit('connection', client);
    client.resume();
  };
  client.on('data', onData);
  client.on('error', () => client.destroy());
}

function listen(server, port, address) {
  return new Promise((resolve) => {
    server.once('error', resolve);
    server.listen(port, address, () => resolve(null));
  });
}

async function open(port, label, onConnection) {
  for (const address of ['127.0.0.1', '::1']) {
    const error = await listen(net.createServer(onConnection), port, address);
    // No IPv6 in the container: localhost is then only 127.0.0.1.
    if (error && !(address === '::1' && error.code === 'EADDRNOTAVAIL')) {
      skipped.push('localhost:' + port + ' (' + label + '): ' + (error.code ?? error.message));
    }
  }
}

if (Array.isArray(spec)) {
  for (const { service, port, targetPort } of spec) {
    await open(port, service, (client) => pipeTo(client, service, targetPort, null));
  }
} else {
  await open(spec.port, 'preview', route);
}
writeFileSync(base + '.skipped', skipped.join('\\n'));
writeFileSync(base + '.pid', String(process.pid));
`;
