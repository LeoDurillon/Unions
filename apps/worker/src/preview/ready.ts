/** What Traefik answers before the service's route exists. */
const NO_ROUTE = '404 page not found';
const BAD_GATEWAY = 502;
const UNAVAILABLE = 503;
const GATEWAY_TIMEOUT = 504;
/** The proxy's answers while the service is not up yet. */
const NOT_UP = new Set([BAD_GATEWAY, UNAVAILABLE, GATEWAY_TIMEOUT]);
const NOT_FOUND = 404;

export type ReadyCheck = {
  proxyUrl: string;
  host: string;
  timeoutMs: number;
  intervalMs: number;
  signal?: AbortSignal;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
};

async function answers(check: ReadyCheck): Promise<boolean> {
  try {
    const response = await (check.fetchFn ?? fetch)(check.proxyUrl, {
      headers: { host: check.host },
      redirect: 'manual',
      signal: AbortSignal.timeout(check.intervalMs * 2),
    });
    if (NOT_UP.has(response.status)) {
      return false;
    }
    // The app's own 404 counts as an answer; the proxy's does not (no route yet).
    if (response.status !== NOT_FOUND) {
      return true;
    }
    const body = await response.text();
    return body.trim() !== NO_ROUTE;
  } catch {
    return false;
  }
}

async function poll(check: ReadyCheck, deadline: number): Promise<boolean> {
  if (Date.now() >= deadline || check.signal?.aborted === true) {
    return false;
  }
  if (await answers(check)) {
    return true;
  }
  await Bun.sleep(check.intervalMs);
  return poll(check, deadline);
}

/** Asks the proxy for the exposed service until it answers; false after `timeoutMs`. */
export function waitReady(check: ReadyCheck): Promise<boolean> {
  return poll(check, Date.now() + check.timeoutMs);
}

/**
 * Whether the proxy itself answers, whatever the status: its network outlives it, so the network
 * existing says nothing about whether it runs.
 */
export async function proxyAnswers(
  proxyUrl: string,
  timeoutMs: number,
  fetchFn: ReadyCheck['fetchFn'] = fetch,
): Promise<boolean> {
  try {
    await fetchFn(proxyUrl, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}
