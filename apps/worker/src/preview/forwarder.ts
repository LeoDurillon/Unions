// Starts the port forwarders in an owner's container: the agent services' ports, and the preview's host names.
import type { ContainerRuntime, PortForward } from '@union/core';

import { runIn } from '../container-exec';
import { FORWARDER_SCRIPT } from './forwarder-script';

/** The agent services' forwarder files in the ticket's container: script, spec, pid, ports it could not take, log. */
const SERVICES_BASE = '/tmp/union-forward';
/** The preview router's: its own process, so neither replaces the other. */
const HOSTS_BASE = '/tmp/union-hosts';

/** One port routed by host name to the preview's services: `{ "api-t12.union.localhost": { service: "api", port: 3000 } }`. */
export type HostRoutes = { port: number; hosts: Record<string, { service: string; port: number }> };

/**
 * Starts the forwarder unless it already runs with the same spec (a run sharing the container
 * started it, or a step before the checks); a different spec replaces it. Prints the ports skipped.
 */
const ENSURE = `f=$UNION_FORWARD_BASE
if [ -f $f.pid ] && kill -0 "$(cat $f.pid)" 2>/dev/null; then
  if [ "$(cat $f.json 2>/dev/null)" = "$UNION_FORWARDS" ]; then cat $f.skipped 2>/dev/null; exit 0; fi
  pid=$(cat $f.pid); kill "$pid" 2>/dev/null; i=0
  while kill -0 "$pid" 2>/dev/null && [ $i -lt 30 ]; do sleep 0.1; i=$((i+1)); done
fi
rm -f $f.pid $f.skipped
printf %s "$UNION_FORWARDS" > $f.json
setsid -f node $f.mjs $f.json $f >> $f.log 2>&1 < /dev/null
i=0
while [ ! -f $f.pid ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
[ -f $f.pid ] || { echo "The port forwarder did not start: $(tail -n 3 $f.log)"; exit 1; }
cat $f.skipped`;

async function ensure(
  runtime: ContainerRuntime,
  container: string,
  base: string,
  spec: PortForward[] | HostRoutes,
): Promise<string[]> {
  await runtime.writeFile(container, `${base}.mjs`, FORWARDER_SCRIPT, '644');
  const result = await runIn(runtime, container, ['sh', '-c', ENSURE], {
    env: { UNION_FORWARDS: JSON.stringify(spec), UNION_FORWARD_BASE: base },
  });
  const lines = result.stdout.split('\n').filter((line) => line.trim() !== '');
  if (result.exitCode !== 0) {
    throw new Error(lines.join('\n') || result.stderr.trim() || 'The port forwarder did not start');
  }
  return lines;
}

/**
 * Makes the agent services reachable on the container's `localhost` (`agentForwards`). Returns what
 * could not be forwarded; throws when the forwarder cannot run at all.
 */
export function ensureForwarder(
  runtime: ContainerRuntime,
  container: string,
  forwards: readonly PortForward[],
): Promise<string[]> {
  return forwards.length === 0
    ? Promise.resolve([])
    : ensure(runtime, container, SERVICES_BASE, [...forwards]);
}

/**
 * Makes the preview answer in the container at its public addresses (`http://api-t12.union.localhost:8080`):
 * `*.localhost` is the container itself, so its port is routed by host name to the services.
 */
export function ensureHostRouter(
  runtime: ContainerRuntime,
  container: string,
  routes: HostRoutes,
): Promise<string[]> {
  return ensure(runtime, container, HOSTS_BASE, routes);
}
