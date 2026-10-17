# GitHub and Notion

<!-- Moved from AGENTS.md: read the file for the area you change; keep it current when behavior changes. -->

- All GitHub writes for tickets (issues, comments, Project status, push, PR) happen in the worker. Containers never
  hold GitHub credentials. The only GitHub calls the web server makes are the ones the UI needs answered right away:
  the setup wizard (verify the token, list repositories and Projects, create a Project), checking and listing the
  GitHub App's installations (`/api/github/app`), looking up a pull request a user links to a ticket, reading an
  issue to create a ticket on it (`routes/issue-import.ts`), reading a linked pull request's discussion (PR tab,
  review import), a reviewed pull request's files and commits, and listing the repository's pull requests (project bar → Pull requests,
  `routes/pull-requests.ts`; the Current reviews tab's records are local, under `/pull-requests/reviews`,
  `routes/current-reviews.ts`), all read only (`src/github-onboarding.ts`, behind the `OnboardingGitHub` interface
  so tests use a fake), and a linked pull request's CI checks (PR tab: check runs, statuses, bot comments, the
  annotations and job logs of a pick; `src/github-checks.ts` behind `CiGitHub`). Posting a pull request review is a write: it goes through the `submit_pr_review` command
  and the worker (`github/pr-review.ts`).
- Notion writes happen in the worker only: event rules set properties of a ticket's page (`updatePage`), and a
  ticket written from an investigation can be created as a page of the project's data source (`createPage`, with
  `markdown` content).
- Notion reads, from the web server: verifying a project's integration secret and data source, and importing
  a page of that data source as a ticket (`src/notion.ts` behind `NotionApi`, `routes/notion.ts`). Uses API version
  `2026-03-11` and `GET /v1/pages/{id}/markdown`. The secret is stored in `projects.notion_token` and never sent to
  the browser (`hasNotion` only). Pages outside the configured data source are refused. The page's markdown is cleaned at import (`notionMarkdown` in the browser-safe `@union/core/notion-markdown`: mentions become links titled from Notion, callouts quotes, comment and color spans their text, toggle children are dedented); the ticket panel cleans older imports as it shows them. Creating a ticket from a page downloads its images (Notion's signed links expire within the hour; only Notion's file hosts, raster images, within the attachment limits) into private ticket files referenced as `attachment:<name>`, which the panel shows inline (`?inline`, raster images only).
- A project reaches GitHub with a token (`projects.github_token`) or an installation of the GitHub App
  (`projects.github_installation_id`; the app's ID and private key are one row of `github_app`). Both are stored in
  plain text (local single-user app, like the original Union) and never reach the browser: responses use
  `PublicProject` / `toPublicProject` (`githubAccess` only) and the app status omits the key. Resolve credentials
  with `projectGitHubAuth` (`@union/core`; installation wins, then token, then `GITHUB_TOKEN`) and build clients
  with `@union/core/github-client`: clients are cached per credential so an installation token is minted once an
  hour, and git gets a fresh token (`gitToken`) right before each clone or push. Every request is bounded
  (`timeoutMs`, `retries`: 30 s per attempt; the web server 20 s and one retry): Octokit queues token minting and
  GraphQL per process, so one stuck request used to block every later call until a restart. Never build an Octokit
  from a project's token by hand.
- Permissions: the GitHub App's form is pre-filled (`app-setup-form.tsx`) with Contents, Issues and Pull requests
  read and write, Metadata read, Checks and Commit statuses read, Actions read and write (the PR tab's CI checks:
  check runs and annotations, commit statuses, job logs; the worker's poll of the PR's checks rollup, which reads as
  unknown without them; write only to re-run a failed job), organization Projects read and write. An existing installation must
  accept added permissions on GitHub (Settings → GitHub Apps → the request) before they apply; until then the CI
  reads answer 403, which `routes/pr-checks.ts` turns into a message naming them. A classic token needs `repo` and
  `project`.
