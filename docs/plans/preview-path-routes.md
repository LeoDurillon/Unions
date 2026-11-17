# Plan: a preview service also served under a path of another service's host

Status: planned (2026-11-17). Nothing built.

## Problem

A preview gives each exposed service one address: `t<id>.union.localhost` for an empty prefix, else
`<prefix>-t<id>.union.localhost` (`previewServiceHost`, `PreviewService` in `schema-types.ts`). The proxy routes by
host only (`routing` in `preview-compose.ts`: one Traefik router per service, `Host(...)`), and so does the router
in the owner's container (`forwarder-script.ts`).

Some projects serve their API under each front end's own origin in test and production: a reverse proxy sends
`https://editor.example.com/api/*` and `https://viewer.example.com/api/*` to the API, with `/api` stripped. The
browser calls a relative `/api`, the same in every environment, and the API's cookies are first-party. Take Acme's
compose file with three exposed services:

| Service  | Port | Prefix   | Address today                       |
| -------- | ---- | -------- | ----------------------------------- |
| `api`    | 3000 | `api`    | `http://api-t12.union.localhost`    |
| `editor` | 3001 | `editor` | `http://editor-t12.union.localhost` |
| `viewer` | 3002 | `viewer` | `http://viewer-t12.union.localhost` |

Once the apps call `/api` relative, a preview can only work if each app proxies `/api` itself (a dev-only Next
`rewrites()` to `{service.api.internal}`, say). That works, but then the preview does not run what production runs:
the API's redirects behind a stripped prefix (`X-Forwarded-Prefix`), streamed responses (SSE) through a proxy, and
cookies set on the front end's host are exactly what such a change needs checked, and the preview cannot show them.

## Design

An exposed service gets an optional list of **extra addresses**, each another exposed service's host and a path:

```
api     port 3000  prefix api
  also at: editor  /api  (strip the path)
  also at: viewer  /api  (strip the path)
```

`http://editor-t12.union.localhost/api/users` reaches `api:3000/users`; `http://editor-t12.union.localhost/` still
reaches `editor`, and `http://api-t12.union.localhost` keeps working. An extra address reuses a host the preview
already has, so the host names, the idle stop's visit counts, the health checks and readiness do not change.

### Settings

`PreviewService` gains `paths?: { host: string; path: string; strip: boolean }[]`, `host` being the prefix of an
exposed service (`''` for the preview's main host). `config` is JSON: no migration, and a project without `paths`
runs as today. Checked on save and before a start (`composeProblems` and the settings' checks, browser-safe in
core):

- `path` starts with `/`, is not `/`, has no `*`, `?`, `#`, backtick or space (it goes into a Traefik rule), and
  ends without `/`;
- `host` is the prefix of another exposed service (not the service's own);
- no two entries, across all services, share a host and a path; one path inside another on the same host
  (`/api`, `/api/v2`) is allowed, the longest wins.

### The proxy (Traefik labels)

`routing` in `preview-compose.ts` adds one router per entry on the serving service, next to its host router:

- `traefik.http.routers.<project>-<service>-<n>.rule`: ``Host(`editor-t12.union.localhost`) && PathPrefix(`/api`)``
- `...priority`: above the host routers (Traefik's default priority is the rule's length, which already favours
  it; set it explicitly so a long host name never wins), the longer path higher;
- with `strip`, a `stripprefix` middleware (`...middlewares.<router>-strip.stripprefix.prefixes=/api`), which also
  sets `X-Forwarded-Prefix: /api` for the service;
- `...service`: the serving service's existing Traefik service, so no second load balancer.

The labels are on the serving service's container; it is on the preview's proxy network already. Shared services
(`preview-shared-proxy.ts`) are out of scope: they have no per-preview host.

### The router in the owner's container

The agent, the e2e tests and the user's commands reach the preview at the same addresses (`host-routes.ts`,
`forwarder-script.ts`). Today that router picks a target from the first request's `Host` and pipes the whole
connection, since a browser keeps one connection per host. With paths, one keep-alive connection to `editor`
carries `/` and `/api/...`, so routing by connection sends the API calls to `editor`.

The router becomes a per-request HTTP proxy for the preview's port (the plain port forwarders for the agent's
services stay TCP pipes):

- `node:http` server; each request's `Host` and path pick the target (longest path first), the prefix stripped and
  `X-Forwarded-Prefix`, `X-Forwarded-Host`, `X-Forwarded-Proto` set as Traefik sets them;
- bodies streamed both ways, no buffering (SSE), `upgrade` piped as raw sockets (websockets, the dev servers' hot
  reload);
- `HostRoutes` becomes `{ port, hosts: { [host]: { default: { service, port }, paths: [{ path, strip, service, port }] } } }`,
  built by `previewRoutes` from the preview's `urls` and `exposedServices(config)`.

The script still has no dependencies (it runs with the image's Node) and stays in the size the container can
start quickly. Its unit tests run it against two small HTTP servers: a path request, a stripped prefix, an SSE
response that arrives line by line, an upgrade.

### Templates and variables

Nothing new is required: `{service.editor.url}/api` writes the extra address. `UNION_URL_<SERVICE>` stays one per
service. The agent's prompt, which lists the preview's addresses, adds each extra one ("`api` also at
`http://editor-t12.union.localhost/api`").

### Settings page

Environments → Compose, under each exposed service: an "Also serve at" list with a host select (the other exposed
services), a path field and "Remove the path before passing the request on" (on by default), with the check's
messages inline. The guide's Previews page says what it is for (an API served under each app's own address, as in
production) and what to type.

## Cookies shared between two apps of one preview

Apps that call the API on their own origin often share a login through a cookie set on a parent domain
(`Domain=.example.com`). In a preview, `editor-t12.union.localhost` and `viewer-t12.union.localhost` have only
`union.localhost` in common, and every preview has it too: a cookie set there by preview 12 is sent to preview 13
and overwrites its own.

A separate, optional step: name the hosts `<prefix>.t<id>.union.localhost`. Each preview then has a parent domain of
its own, `{preview.host}` (`t12.union.localhost`), for the app's cookie domain variable. The site stays
`union.localhost`, so browsers still offer a login saved on one preview on the others. It changes
`previewServiceHost`, the addresses of the running previews (they move at their next start) and the screenshots and
links that hold old ones, so it would be a project setting ("One domain per preview"), off by default. To check
first, in Chromium and Firefox, and with Node's resolver in the container (`/etc/hosts` lines are written per host,
so it should not matter): a cookie with `Domain=t12.union.localhost` set from `editor.t12.union.localhost` is sent
to `viewer.t12.union.localhost` and not to `viewer.t13.union.localhost`.

## Steps

1. **Settings and checks**: `paths` on `PreviewService`, the checks in core with their tests, the settings page's
   list. Saved but not yet applied: the page says so until step 2 ships.
2. **Traefik**: the routers and middlewares in `routing`, tests on the written file. Check with real Docker on
   ticket 9001 (`docs/architecture/testing.md`): a compose file with a front end and an API, `curl` through the
   proxy at the front end's host with and without `/api`, the stripped path and `X-Forwarded-Prefix` seen by the
   API, an SSE response streamed.
3. **The router in the owner's container**: the per-request proxy, `previewRoutes`, the agent's prompt lines; the
   same checks from inside the ticket's container (`curl`, then a Playwright page that calls `/api`).
4. **Guide and spec**: `documentation/previews.md`, `docs/spec/preview-environments.md`.
5. **Optional, separately**: one domain per preview for shared cookies, after the browser check above.

## Not in scope

- A path on a host that is not a preview service (a free-form host name): every address stays under
  `union.localhost`.
- Rewriting paths other than removing the prefix, headers other than the forwarded ones, or redirects in responses.
- Paths for the shared services' pages.
