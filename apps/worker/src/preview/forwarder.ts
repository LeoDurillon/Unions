import type { ContainerRuntime, PortForward } from '@union/core';

import { runIn } from '../container-exec';

/** The forwarder's files in the ticket's container: script, spec, pid, ports it could not take, log. */
const BASE = '/tmp/union-forward';

/**
 * Listens on `127.0.0.1` and `::1` (Node resolves `localhost` to `::1` first) for each port and
 * pipes every connection to its service, connecting only then: the service need not be up yet (a
 * client then gets a reset, not a refusal: a port check passes before the service is ready). A
 * port it cannot take is written to `.skipped`; the pid file, written last, says it is ready.
 */
const SCRIPT = `import net from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';

const base = ${JSON.stringify(BASE)};
const forwards = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const skipped = [];
function listen(server, port, address) {
  return new Promise((resolve) => {
    server.once('error', resolve);
    server.listen(port, address, () => resolve(null));
  });
}
for (const { service, port, targetPort } of forwards) {
  for (const address of ['127.0.0.1', '::1']) {
    const server = net.createServer((client) => {
      const upstream = net.connect(targetPort, service);
      let connected = false;
      upstream.once('connect', () => { connected = true; });
      // The service is not up: a reset, as near as a listening port gets to a refusal.
      const end = () => {
        if (connected || client.destroyed) { client.destroy(); } else { client.resetAndDestroy(); }
        upstream.destroy();
      };
      client.on('error', end);
      upstream.on('error', end);
      client.pipe(upstream);
      upstream.pipe(client);
      client.on('close', end);
      upstream.on('close', end);
    });
    const error = await listen(server, port, address);
    // No IPv6 in the container: \`localhost\` is then only 127.0.0.1.
    if (error && !(address === '::1' && error.code === 'EADDRNOTAVAIL')) {
      skipped.push(\`localhost:\${port} (\${service}): \${error.code ?? error.message}\`);
    }
  }
}
writeFileSync(base + '.skipped', skipped.join('\\n'));
writeFileSync(base + '.pid', String(process.pid));
`;

/**
 * Starts the forwarder unless it already runs with the same ports (a run sharing the container
 * started it, or a step before the checks); a different set replaces it. Prints the ports skipped.
 */
const ENSURE = `f=${BASE}
if [ -f $f.pid ] && kill -0 "$(cat $f.pid)" 2>/dev/null; then
  if [ "$(cat $f.json 2>/dev/null)" = "$UNION_FORWARDS" ]; then cat $f.skipped 2>/dev/null; exit 0; fi
  pid=$(cat $f.pid); kill "$pid" 2>/dev/null; i=0
  while kill -0 "$pid" 2>/dev/null && [ $i -lt 30 ]; do sleep 0.1; i=$((i+1)); done
fi
rm -f $f.pid $f.skipped
printf %s "$UNION_FORWARDS" > $f.json
setsid -f node $f.mjs $f.json >> $f.log 2>&1 < /dev/null
i=0
while [ ! -f $f.pid ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
[ -f $f.pid ] || { echo "The port forwarder did not start: $(tail -n 3 $f.log)"; exit 1; }
cat $f.skipped`;

/**
 * Makes the agent services reachable on the container's `localhost` (`agentForwards`). Returns what
 * could not be forwarded; throws when the forwarder cannot run at all.
 */
export async function ensureForwarder(
  runtime: ContainerRuntime,
  container: string,
  forwards: readonly PortForward[],
): Promise<string[]> {
  if (forwards.length === 0) {
    return [];
  }
  await runtime.writeFile(container, `${BASE}.mjs`, SCRIPT, '644');
  const result = await runIn(runtime, container, ['sh', '-c', ENSURE], {
    env: { UNION_FORWARDS: JSON.stringify(forwards) },
  });
  const lines = result.stdout.split('\n').filter((line) => line.trim() !== '');
  if (result.exitCode !== 0) {
    throw new Error(lines.join('\n') || result.stderr.trim() || 'The port forwarder did not start');
  }
  return lines;
}
