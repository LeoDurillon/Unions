// The Node script that forwards ports in an owner's container: plain ports, or HTTP by host name.

/**
 * Run as `node script.mjs <spec.json> <base>`. The spec is either a list of ports, each piped to its
 * service (`[{ service, port, targetPort }]`), or one port routed by the request's host name
 * (`{ port, hosts: { "<host>": { service, port } } }`): the browser in the container reaches the
 * preview at the addresses it has outside, cookies included. Listens on `127.0.0.1` and `::1`
 * (Node resolves `localhost` to `::1` first) and connects to the service only then: the service
 * need not be up yet (a client then gets a reset, not a refusal: a port check passes before the
 * service is ready). A port it cannot take is written to `<base>.skipped`; the pid file, written
 * last, says it is ready.
 */
export const FORWARDER_SCRIPT = `import net from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const base = process.argv[3];
const MAX_HEAD = 65536;
const NOT_FOUND = 'HTTP/1.1 404 Not Found\\r\\ncontent-length: 0\\r\\nconnection: close\\r\\n\\r\\n';
const skipped = [];

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

// A browser keeps one connection per host: the first request's host routes the whole connection.
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
    pipeTo(client, target.service, target.port, head);
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
