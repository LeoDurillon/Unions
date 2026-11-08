// Refuses API requests from anywhere but Union's own page: other hosts (DNS rebinding, containers), other origins (CSRF), form bodies.
import type { MiddlewareHandler } from 'hono';

const FORBIDDEN = 403;
const UNSUPPORTED_MEDIA = 415;
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** The bodies Union's page sends: JSON, attachments (multipart) and project files (bytes). */
const BODY_TYPES = new Set(['application/json', 'multipart/form-data', 'application/octet-stream']);
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/** The host names the API answers to: loopback, and those `UNION_ALLOWED_HOSTS` adds (comma-separated). */
export function allowedHosts(env: Record<string, string | undefined> = process.env): Set<string> {
  const extra = (env.UNION_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== '');
  return new Set([...LOOPBACK, ...extra]);
}

function hasBody(headers: Headers): boolean {
  const length = headers.get('content-length');
  return headers.has('transfer-encoding') || (length !== null && length !== '0');
}

/**
 * A write must say it carries one of the page's bodies: a cross-site form or `text/plain` fetch is
 * sent without asking the server first, but these types make the browser ask, and it is never told yes.
 */
function bodyAccepted(method: string, headers: Headers): boolean {
  if (READS.has(method)) {
    return true;
  }
  const type = headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  return type === undefined ? !hasBody(headers) : BODY_TYPES.has(type);
}

/** Why the request is refused, or null. The URL's host is the request's `Host` header. */
function refusal(
  request: Request,
  hosts: Set<string>,
): { status: typeof FORBIDDEN | typeof UNSUPPORTED_MEDIA; error: string } | null {
  const url = new URL(request.url);
  if (!hosts.has(url.hostname.toLowerCase())) {
    return { status: FORBIDDEN, error: `Union does not answer to the host "${url.hostname}"` };
  }
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin) {
    return { status: FORBIDDEN, error: 'Requests from other sites are refused' };
  }
  if (!bodyAccepted(request.method, request.headers)) {
    return { status: UNSUPPORTED_MEDIA, error: 'Send the body as application/json' };
  }
  return null;
}

/** The middleware: only Union's own page, on an allowed host, reaches the API. */
export function requestGuard(hosts: Set<string> = allowedHosts()): MiddlewareHandler {
  return (c, next) => {
    const refused = refusal(c.req.raw, hosts);
    if (refused) {
      return Promise.resolve(c.json({ error: refused.error }, refused.status));
    }
    return next();
  };
}
