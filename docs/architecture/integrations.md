# GitHub and Notion

<!-- Moved from AGENTS.md: read the file for the area you change; keep it current when behavior changes. -->

- All GitHub writes for tickets (issues, comments, Project status, push, PR) happen in the worker. Containers never
  hold GitHub credentials. The only GitHub calls the web server makes are the ones the UI needs answered right away:
  the setup wizard (verify the token, list repositories and Projects, create a Project), checking and listing the
  GitHub App's installations (`/api/github/app`), looking up a pull request a user links to a ticket, reading an
  issue to create a ticket on it (`routes/issue-import.ts`), reading a linked pull request's discussion (PR tab,
  review import), a reviewed pull request's files and commits, and listing the repository's pull requests and stacks (project bar → Pull requests,
  `routes/pull-requests.ts`; the Current reviews tab's records are local, under `/pull-requests/reviews`,
  `routes/current-reviews.ts`), all read only (`src/github-onboarding.ts`, behind the `OnboardingGitHub` interface
  so tests use a fake), and a linked pull request's CI checks (PR tab: check runs, statuses, bot comments, the
  annotations and job logs of a pick; `src/github-checks.ts` behind `CiGitHub`). Posting a pull request review is a write: it goes through the `submit_pr_review` command
  and the worker (`github/pr-review.ts`).
- Notion writes happen in the worker only: event rules set properties of a ticket's page, or for a review posted from the review panel, the page that review is linked to (`updatePage`; `event-actions/notion.ts`), and a
  ticket written from an investigation can be created as a page of the project's data source (`createPage`, with
  `markdown` content).
- Trackers a project is connected to (Notion now) are rows of `integrations`, one per kind: secret, config, the
  tracker's columns as read. Each kind has a browser-safe entry (`@union/core/integration-kinds`: label, ID parsing,
  config check) and a provider over its API client (`integrationProvider`, `integrations/providers.ts`). The web
  routes are generic (`routes/integrations.ts`): `POST /api/integrations/:kind/verify` (no project: onboarding),
  and under `/api/projects/:id/integrations/:kind`, `PUT` (reads the columns with the new secret and config, then
  saves; no secret keeps the stored one), `DELETE`, `POST /fields` (read the columns again) and `POST /import` (an
  item of the source as a ticket preview). A new project takes `integrations: [{ kind, secret, config }]`. The
  browser sees `PublicProject.integrations` (`toPublicIntegration`, `public-project.ts`: kind, title, config,
  `ready`), never a secret. The web server never calls a provider's `createItem` (ast-grep
  `web-reads-notion-only`). A new ticket takes `origin: { kind, id, url }` (`routes/ticket-origin.ts`, which also
  keeps the item's images per kind), and an investigation's ticket `target: kind`. In the client, the New ticket
  dialog has one "Import from …" tab per ready integration (`components/integrations/source-import.tsx`), the
  investigation one "Also create it in …" switch per integration, and each kind's own screens (settings,
  onboarding step, rule action fields) live in `components/integrations/<kind>/`.
- Notion reads, from the web server: verifying a project's integration secret and data source, and importing
  a page of that data source as a ticket (`src/notion.ts` behind `NotionApi`, through the Notion
  `IntegrationProvider`), and the page a pull
  request under review is linked to (any page shared with the integration; `routes/review-notion.ts`, its text read
  fresh each time, mention titles from core's `integrations/notion-mentions.ts`). Uses API version
  `2026-03-11` and `GET /v1/pages/{id}/markdown`. The secret, data source and columns as read are a row of
  `integrations` (kind `notion`; `integrations/notion-integration.ts` reads and saves it), never sent to the browser.
  `projects.notion_token` and `config.notionDataSourceId` are no longer written or read (dropped in a later
  migration). A ticket's page is its
  origin (`tickets.origin_kind`, `origin_id`, `origin_url`). Pages outside the configured data source are refused. The page's markdown is cleaned at import (`notionMarkdown` in the browser-safe `@union/core/notion-markdown`: mentions become links titled from Notion, callouts quotes, comment and color spans their text, toggle children are dedented); the ticket panel cleans older imports as it shows them. Creating a ticket from a page downloads its images (Notion's signed links expire within the hour; only Notion's file hosts, raster images, within the attachment limits) into private ticket files referenced as `attachment:<name>`, which the panel shows inline (`?inline`, raster images only).
- A project reaches GitHub with a token (`projects.github_token`) or an installation of the GitHub App
  (`projects.github_installation_id`; the app's ID and private key are one row of `github_app`). Both are stored in
  plain text (local single-user app, like the original Union) and never reach the browser: responses use
  `PublicProject` / `toPublicProject` (`githubAccess` only) and the app status omits the key. Resolve credentials
  with `projectGitHubAuth` (`@union/core`; installation wins, then token, then `GITHUB_TOKEN`) and build clients
  with `@union/core/github-client`: clients are cached per credential so an installation token is minted once an
  hour, and git gets a fresh token (`gitToken`) right before each clone or push. Every request is bounded
  (`timeoutMs`, `retries`: 30 s per attempt; the web server 20 s and one retry): Octokit queues token minting and
  GraphQL per process, so one stuck request used to block every later call until a restart. Those bounds only cover
  `fetch`, so the web server also sets `deadlineMs` (45 s for the whole call, queues and token minting included,
  failing as a 504) and `throttled: false` (no process-wide throttling queues for its reads): without them its
  GitHub reads once all waited forever while the worker's still worked. Never build an Octokit
  from a project's token by hand.
- Permissions: the GitHub App's form is pre-filled (`app-setup-form.tsx`) with Contents, Issues and Pull requests
  read and write, Metadata read, Checks and Commit statuses read, Actions read and write (the PR tab's CI checks:
  check runs and annotations, commit statuses, job logs; the worker's poll of the PR's checks rollup, which reads as
  unknown without them; write only to re-run a failed job), organization Projects read and write. An existing installation must
  accept added permissions on GitHub (Settings → GitHub Apps → the request) before they apply; until then the CI
  reads answer 403, which `routes/pr-checks.ts` turns into a message naming them. A classic token needs `repo` and
  `project`.

## Union's own remote

The sidebar's Update fetches Union's checkout's `origin` (`docs/spec/union-update.md`), not a project's. An SSH
`origin` uses the host's `~/.ssh`, mounted read-only into the worker container only (`UNION_SSH_DIR` in
`compose.yaml`); the web and the agent containers never get it. The fetch runs with `BatchMode=yes` and
`StrictHostKeyChecking=yes`, so a key with a passphrase or an unknown host fails instead of prompting.
