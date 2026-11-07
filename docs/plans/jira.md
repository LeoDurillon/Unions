# Jira

Status: planned (2026-11-06); steps 1 to 4 built (branch `jira`, 2026-11-07). Scope: Jira Cloud, an API token, importing an issue as a ticket. Rule actions,
creating issues from investigations and a comments tab are later plans (listed at the end).

## Why

Some projects track their work in Jira, not Notion. Today a ticket written from a Jira issue is copied by hand:
title, description, then each attachment. The [ticket source integrations](source-integrations.md) refactor moved
Notion behind a generic `integrations` table, a ticket origin and a provider per kind, so that Jira is a second
implementation. This plan is that implementation, reads only.

## What the user gets

- In project settings (and as an optional onboarding step), a Jira section: the site
  (`https://acme.atlassian.net`), the email of the account, an API token
  (id.atlassian.com → Security → API tokens) and the Jira project key. Saving checks them and shows the project's
  name.
- In the New ticket dialog, an "Import from Jira" tab next to Notion's: paste an issue link or key (`ABC-123`),
  Union fills the title and the description, converted to markdown, and keeps the issue's images and attachments
  as ticket files.
- The ticket panel links the issue ("From Jira: ABC-123"); the board's origin filter offers "From Jira".

What does not change: GitHub stays the source of truth (the ticket is still a GitHub issue and Project item); the
import is a copy, not a sync; reads from the web, writes (none in this plan) from the worker; the token never
reaches the browser.

## Decisions

- **D1. Jira Cloud only.** Data Center uses personal access tokens (Bearer), REST v2 and wiki markup instead of
  Atlassian Document Format (ADF): another client and another converter. Not asked for; the `kind` could be
  `jira_dc` later.
- **D2. API token with Basic auth.** `Authorization: Basic base64(email:token)`. The token is the integration's
  `secret`; the email is config, shown in settings. OAuth 2.0 (3LO) needs an app registered with Atlassian and a
  callback URL, which a local single-user app does not have. The token acts as its user: Union sees what that user
  sees.
- **D3. The site is an `atlassian.net` host, nothing else.** The token is sent to whatever `site` names, so
  `readConfig` accepts only `https://<name>.atlassian.net` (lower-cased, path dropped; a bare `acme` becomes
  `https://acme.atlassian.net`). Custom domains on Jira Cloud are rare and left out.
- **D4. Config and fields.** `config: { site, email, projectKey }`. `fields` (as read, typed by
  `jiraFieldsOf(row)`): `{ projectName, issueTypes: { id, name }[], statuses: { id, name, category }[] }`, read
  with `GET /rest/api/3/project/{key}` and `GET /rest/api/3/project/{key}/statuses`. Enough for the settings
  form now and for the rule actions later; field schemas (`GET /rest/api/3/field`) are read when the rule actions
  need them, not now.
- **D5. The origin is the issue key.** `origin_kind = 'jira'`, `origin_id = 'ABC-123'`,
  `origin_url = https://<site>/browse/ABC-123`. A key changes when the issue moves to another project; Jira
  redirects the old key, so the stored one keeps working for links. The import refuses an issue of another project
  (`ItemOutsideSourceError`), and a link to another site than the configured one.
- **D6. ADF is converted in the provider; `cleanMarkdown` is the identity for Jira.** REST v3 returns the
  description as ADF (JSON), not markdown, so `item()` converts it (`adf-markdown.ts`, pure, its own tests) and
  returns markdown like Notion's provider does. `cleanMarkdown` exists for markdown stored by older Notion
  imports; Jira's returns its input. No change to the interface of `IntegrationProvider`.
- **D7. Attachments as links the web downloads with the token.** ADF media nodes carry a Media Services id, not
  the attachment's id; the attachment list (`fields.attachment`) carries the id, file name, type and size. The
  converter is given the attachment list and turns each media node into a link to
  `https://<site>/rest/api/3/attachment/content/{id}`, matched on file name (`attrs.alt`, which Jira sets to it),
  as an image (`![name](…)`) for images. Attachments no node matched are appended under an `## Attachments`
  heading, as links. So the editor shows every file, as Notion imports do, and `SourceItem` keeps its shape.
  A media node with no matching attachment becomes its name in italics.
- **D8. `FILES` takes the integration's access.** `routes/ticket-origin.ts` maps each kind to
  `(markdown) => files`; Notion's links are signed, Jira's need the token. The signature becomes
  `(markdown, access: { secret, config }) => files`, the route reading the project's integration row. Notion's
  ignores the access. The Jira downloader (`apps/web/src/jira-files.ts`) only fetches links of the configured site
  under `/rest/api/3/attachment/content/`, with the same limits and order as Notion's (images first, four at a
  time, within the attachment limits). Jira answers with a redirect to its media host: follow it by hand
  (`redirect: 'manual'`) and fetch the `Location` **without** the `Authorization` header, so the token is never
  sent off the site.
- **D9. Kinds say whether they can create items.** Jira's provider has no `createItem` yet. `IntegrationKind`
  gains `createsItems: boolean`; the investigation's "Also create it in …" switch lists only kinds that do, and
  `requestTicket` (`investigation-tickets.ts`, which checks only Notion today) refuses a target kind that cannot,
  instead of letting the worker fail later.

## Design

### Core (`packages/core/src/integrations/`)

- `jira-api.ts`: `JiraApi` interface and its `fetch` implementation (REST v3, Basic auth, JSON, a timeout per
  request; a 429 answers with its `Retry-After` in the error), and `jira-api-fake.ts` for tests. Calls:
  `myself()` (`GET /rest/api/3/myself`), `project(key)`, `projectStatuses(key)`,
  `issue(key)` (`GET /rest/api/3/issue/{key}?fields=summary,description,attachment,issuetype,project`).
  A 401 says the email or token is wrong, a 404 on the project says the key is wrong or not visible to that user.
- `jira-ref.ts`: `parseJiraKey(input)`, browser-safe: a bare key (`abc-123` → `ABC-123`), `…/browse/ABC-123`,
  or any URL with `selectedIssue=ABC-123` (boards, filters). `jiraIssueSite(input)` gives the host of a link, for
  D5's site check.
- `adf-markdown.ts`: ADF → GitHub-flavored markdown, pure. Nodes: paragraph, heading, bulletList, orderedList
  (with `attrs.order`), listItem, taskList/taskItem (`- [ ]`), codeBlock (with `attrs.language`), blockquote,
  panel (a quote headed by its type), rule, table (header row from the first row; cells flattened to one line),
  expand/nestedExpand (its title in bold, then its content), mediaSingle/mediaGroup/media (D7), hardBreak, text
  with marks (strong, em, code, strike, link; underline, color, sub/sup dropped), mention (`@name`), emoji
  (its text), date (ISO), status (its text in brackets), inlineCard/blockCard/embedCard (a link). An unknown node
  keeps its text content, so nothing is lost silently. Several files to stay under 300 lines: blocks, inline
  marks, tables.
- `jira-provider.ts`: `verify` (`myself`, then the project, title = project name), `readFields` (D4), `item`
  (issue; outside the project → `ItemOutsideSourceError`; markdown from the converter; `truncated` when the
  description exceeds the same limit Notion's import uses).
- `jira-integration.ts`: `jiraConfigOf(row)`, `jiraFieldsOf(row)` type guards (D4 of the refactor plan).
- `kinds.ts`: `IntegrationKindName = 'notion' | 'jira'`; Jira's entry: label "Jira", item "issue", source
  "project", `parseRef: parseJiraKey`, `cleanMarkdown: identity`, `readConfig` (D3), `createsItems: false`
  (Notion: `true`). `kinds.ts` must stay browser-safe: it imports `jira-ref.ts` only.
- `providers.ts`: `IntegrationApis = { notion: NotionApi; jira: (site, email) => JiraApi }` (the client depends on
  the config, unlike Notion's); the web builds it in `routes/api.ts` and `routes/project-subroutes.ts`.

Adding `'jira'` to `IntegrationKindName` makes the type checker list each `Record<IntegrationKindName, …>` left to
fill (`FILES`, `PROVIDERS`, the client's per-kind maps); fill them rather than widening them to `Partial`.

### Web server

- `routes/integrations.ts`: unchanged apart from the apis; verify, save, fields and import already work per kind.
- `routes/ticket-origin.ts`: D8, and the site check of D5 for Jira links.
- `jira-files.ts`: D8's downloader.
- `.gitleaks.toml`: a rule for Atlassian API tokens (`ATATT3` followed by base64url characters), with a test
  string in its allowlist checked the way the existing rules are.
- `ast-grep/rules/web-reads-notion-only.yml`: rename to `web-reads-trackers-only`, message unchanged; nothing Jira
  writes yet, the rule already covers `createItem`. Rule test cases updated.

### Client (`apps/web/client/`)

- `components/integrations/jira/jira-section.tsx` (settings) and `jira-step.tsx` (onboarding), mounted next to
  Notion's. Fields: site, email, token (password field; "keep the stored one" when empty, as Notion's), project
  key; a link to Atlassian's API token page; on save, the project name, its issue types and statuses as read.
- `source-import.tsx`: nothing to change beyond the kind's labels (one tab per ready integration already).
- `board-toolbar.tsx`: the origin filter's "From Notion" becomes one option per kind among the project's tickets'
  origins (`ORIGINS` built from the kinds).
- `investigations/investigation-ticket.tsx`: D9.
- The Notion tab of the ticket panel stays Notion's; Jira has no tab in this plan.

## Steps

Each step ships on its own; `bun run check` after each.

1. **Converter.** `adf-markdown.ts` and its tests, from real ADF samples (a description with each node type,
   copied from a test issue's `GET /issue` response, scrubbed of names). No wiring.
   Built: `integrations/adf-markdown.ts` over `adf-node.ts`, `adf-inline.ts`, `adf-lists.ts`, `adf-table.ts` and
   `adf-media.ts` (media through a resolver the caller passes; panels as GitHub alerts). The test samples follow
   the documented ADF node shapes; check them against a real issue's response in step 5.
2. **Client and provider in core.** `jira-api.ts` and its fake, `jira-ref.ts`, `jira-provider.ts`,
   `jira-integration.ts`, the `kinds.ts` entry and `createsItems`, `providers.ts`. Tests with the fake: verify
   (good, 401, unknown project), fields, item (in the project, outside it, missing), key parsing, config checks
   (non-atlassian host refused). Fill `FILES` with a Jira entry that keeps the links (no download) until step 4.
   Built, with these changes to the design above: `JiraApi` takes a `JiraAuth` (site, email, token) on each call,
   as `NotionApi` takes a token, so `IntegrationApis.jira` is one client, not a factory; the client also refuses
   a site that is not `atlassian.net` and redirects (`redirect: 'error'`). Key and config parsing are
   `jira-config.ts` (not `jira-ref.ts`), with `jiraConfigOf`; responses are read by `jira-parse.ts`; errors are
   `JiraError`. No `jira-integration.ts` and no `jiraFieldsOf` yet: nothing reads Jira's stored fields until the
   rule actions. No truncation (`truncated: false`): Union sets no limit on an imported text. The web's
   `guarded` (`routes/notion.ts`) maps a `JiraError`'s 401 and 404 as it does Notion's. `createsItems` (D9) is
   left to step 3, with the switch that reads it. The fake is inline in `jira-provider.test.ts`; the fetch
   client is tested with a faked `fetch` (`jira-api.test.ts`).
3. **Settings, onboarding and import.** The client components, the apis in the web, the origin filter, D9.
   Route tests in `integration-routes.test.ts` (Jira verify, save, import, an issue from another project, a ticket
   with a Jira origin; its existing `kind: 'jira'` → 404 cases change to an unknown kind). UI check with
   `scripts/ui-check/` and a faked `JiraApi`: settings, the import tab, the created ticket's origin link.
   Built: settings `components/integrations/jira/jira-section.tsx` (fields and help shared with the onboarding step in
   `jira-fields.tsx`), behind `tracker-section.tsx` (one settings body per kind); Disconnect moved to
   `integrations/disconnect.tsx` for both kinds. The onboarding draft holds `trackers: Record<kind, { secret, config,
   title }>` instead of Notion's three fields, with a Jira step after Notion's; both verify through
   `integrations/tracker-verify.tsx`. The settings header shows the Jira project's name, not its types and statuses
   (nothing uses them yet). D5's site check is `IntegrationKind.refError` (Jira: `jiraRefSiteError`), called by the
   import route. D9 as planned (`createsItems`; the switch reads `creatingKinds`). The origin filter lists the
   trackers the board's tickets came from (`originOptions`); "From GitHub" now means no tracker origin. Route tests
   are a new `jira-routes.test.ts` (the Notion file is near 300 lines). gitleaks: the default `atlassian-api-token`
   rule matches only 192-character tokens, so `.gitleaks.toml` adds `atlassian-api-token-any-length`. The ast-grep
   rule is now `web-reads-trackers-only`. User guide: `tickets.md` (From Jira), `first-project.md` (the wizard step,
   Connect Jira), `settings.md`. UI check on the worktree's web server with a scratch database, the Jira and GitHub
   calls stubbed in the browser: the board filter, settings (Verify and save sends the new token and config), the
   import (preview, then the ticket with origin `jira`/`ABC-7`), and the wizard step (skippable while empty, Next
   waits for Verify once a field is typed, the site comes back normalized, the summary lists Jira).
4. **Attachments (D7, D8).** The converter's attachment links, `jira-files.ts`, the `FILES` signature change.
   Tests: links matched and unmatched, a link to another site or path not fetched, the redirect fetched without
   `Authorization`.
   Built: the matching is core's `integrations/jira-attachments.ts` (`issueMarkdown`, called by the provider); only
   PNG, JPEG, GIF and WebP attachments are images (as Notion's), SVG and others files. The converter now writes
   plain link targets (`[name](url)`, not `(<url>)`), which the web's link scan reads. Notion's downloader moved to
   `apps/web/src/tracker-files.ts` (a `FileSource` per tracker: which links, how to fetch, how files are named);
   `notion-files.ts` keeps its behaviour and tests. `jira-files.ts` names files by their link text (Jira's file
   names) when the download gives none. `withOriginFiles` takes the database and project to read the integration.
   Checked against Bun's real `fetch` that `redirect: 'manual'` gives the 303 and its `Location`.
5. **Real check and docs.** Against a real Jira Cloud site (a free one is enough; ask the user for a test site
   and token): connect, import an issue with a table, a code block, an image and a PDF; check the markdown and the
   ticket files. Then `docs/architecture/integrations.md` (Jira reads, D2, D3, D8), `docs/spec/flow.md` if it
   names Notion as the only source, `documentation/` (a page on connecting Jira and importing an issue), this plan's
   status and `docs/plans/README.md`.

## Risks

- **Media node ↔ attachment matching on file name (D7).** Two attachments with the same name, or an `alt` edited
  by hand, match the wrong one or none. Then the file is still listed under Attachments; only its place in the text
  is lost. Check on the real site in step 5; if Jira gives a better key (`attrs.id` matching an attachment's
  `mediaApiFileId`, not documented), use it.
- **Rate limits.** Jira Cloud limits per user; an import is three or four calls, so only bulk use would hit it.
  The 429 message says to wait.
- **Token scope.** Classic API tokens act with all of the user's permissions; Atlassian's scoped tokens
  (`read:jira-work` is enough for this plan) use another base URL (`api.atlassian.com/ex/jira/{cloudId}`). Accept
  classic tokens first; scoped tokens are a follow-up if the user prefers them.

## Later (separate plans)

- **Rule actions** `jira_field` (set fields, typed from `GET /rest/api/3/field` schemas) and `jira_transition`
  (move the status: `GET`/`POST /issue/{key}/transitions`, picked by target status), in the worker
  (`event-actions/jira.ts`, a slow `perTick`), with their rule fields under `components/integrations/jira/`.
- **Investigations create issues**: `createItem` (`POST /rest/api/3/issue`, markdown → ADF converter),
  `createsItems: true`; generalize `event-deliveries.ts`'s `originKind: 'notion'`.
- **A Jira tab** with the issue's comments, and posting one from the worker, as Notion's.
- **`'jira'` in `SPEC_SOURCES`**, so a review can read an issue as its spec.
