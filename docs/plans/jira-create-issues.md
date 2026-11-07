# Create Jira issues from investigations

Status: planned (2026-11-07); steps 1 to 3 built (branch `jira-create-issue`, 2026-11-07). Follows [Jira](jira.md), [Jira rule actions](jira-rule-actions.md) and
[Jira comments on the ticket](jira-comments.md), all built. Scope: "Also create it in Jira" when an investigation
writes a ticket, as "Also create it in Notion" does.

## Why

An investigation can end with **Write a ticket**: an agent drafts a backlog ticket from the answer. For a project
connected to Notion, **Also create it in Notion** adds a page for it in the data source and links the ticket to it.
A project connected to Jira gets nothing: the user copies the draft into a new Jira issue by hand, then the ticket
is not linked to it, so the Jira tab and the Jira rules do not apply. The same switch should create the Jira issue.

## What the user gets

- On an answered investigation, **Write a ticket** offers **Also create it in Jira** when the project is connected
  to Jira, beside Notion's (one at most is on: a ticket has one origin).
- The worker drafts the ticket, creates an issue in the Jira project (its title as the summary, its description
  converted to Jira's rich text) of the issue type picked in the Jira settings, and links the ticket to it: the
  ticket shows **From Jira: ABC-12**, its Jira tab reads the issue's comments, and Jira rules apply to it.
- If Jira refuses the issue (a required field, a missing permission), the ticket is still created and the
  investigation says why, as for Notion.
- **Settings → Integrations → Jira** gains **Issue type for new issues** (Task, Story, Bug…, from the project).

## What does not change

- The draft and the ticket: the ticket's text stays Union's; the issue gets a copy, not a sync.
- The investigation flow, its states and its events.
- Writes only from the worker; the web never calls `createItem` (ast-grep `web-reads-trackers-only`).

## Decisions

- **D1. Through the provider's `createItem`, as Notion.** `withTargetItem` (worker,
  `investigation-ticket-target.ts`) already calls `integrationProvider(kind, …).createItem` and links the ticket
  to the item it returns; Jira's provider implements it and `createsItems` becomes `true`. Nothing in the
  investigation code names Jira. `requestTicket` checks only Notion's connection today
  (`target === 'notion' && !notionAccessOf`): it becomes a check per kind (`jiraAuthOf` for Jira).
  `event-deliveries.ts`'s `originKind: 'notion'`, which the first Jira plan pointed at, is the backfill of old
  Notion imports and stays as it is.
- **D2. Markdown parsed with mdast, mapped to ADF.** The draft is markdown an agent wrote: headings, lists (nested,
  ordered, task lists), code blocks, quotes, tables, links, emphasis. A hand-written subset (as `text-adf.ts` for
  rule texts) would drop some of it. `mdast-util-from-markdown` with `mdast-util-gfm` and
  `micromark-extension-gfm` is the parser `remark-gfm` uses for what Union shows, already in the lockfile through
  it: a new `markdown` catalog holds the three at those versions, used by core only. A pure
  `integrations/markdown-adf.ts` maps each mdast node to ADF (`heading`, `bulletList`, `orderedList` with `order`,
  `taskList`, `codeBlock` with `language`, `blockquote`, `table` with `tableHeader` cells, `rule`, text marks
  `strong`, `em`, `code`, `strike`, `link`); HTML and images become their text or link (an image is not uploaded:
  investigations have no files).
- **D3. The issue type is the integration's config.** `config.issueTypeId`, picked in the Jira settings from the
  project's types (stored with the fields, sub-task types left out: `projectOf` keeps the `subtask` flag). Without
  one, the provider picks "Task" if the project has it, else the first type. Saving a new type goes through
  `PUT …/integrations/jira`, which reads the project again (a config change forgets the stored fields, then reads
  them).
- **D4. Jira's refusal is the investigation's `originError`.** A project whose create screen requires a field
  (components, a priority without default) answers 400 with `errors: { components: "Component/s is required." }`;
  `errorMessageOf` already joins them. The ticket is created without an origin, and the investigation shows "Not
  created in Jira: Component/s is required." No create-metadata read first: it would need the issue type's fields
  and a form for them, for a case the message explains.
- **D5. A description over Jira's limit is cut.** Jira refuses a description of more than 32 767 characters; an
  agent's draft rarely comes near. The converter stops before the limit and ends with "(cut: the full description
  is in Union)". The summary is cut at 255 characters, Jira's limit.

## Design

### Core

- `integrations/markdown-adf.ts`: `markdownAdf(markdown): AdfDocument` (D2), pure, its own tests; `text-adf.ts`'s
  `AdfDocument` type grows to the nodes it emits (or the new file declares its own and `addComment` takes either).
- `jira-api.ts`: `createIssue(auth, { projectKey, issueTypeId, summary, description })` →
  `{ key }` (`POST /rest/api/3/issue`).
- `jira-config.ts`: `issueTypeId` optional in `JiraConfig` and `readJiraConfig`; `jira-parse.ts`: `subtask` on
  issue types; `jira-provider.ts`: `createItem` (D3, D5), returning `{ id: key, url: site/browse/key, … }`.
- `kinds.ts`: Jira's `createsItems: true`. `investigation-tickets.ts`: the connection check per kind (D1).

### Client

- `components/integrations/jira/jira-section.tsx`: **Issue type for new issues**, a select of the stored types
  (once read), saved with the rest. The investigation's switch needs nothing: it lists the kinds that create items.

## Steps

Each step ships on its own; `bun run check` after each.

1. **Markdown to ADF.** The `markdown` catalog (`bun add --catalog=markdown` in `packages/core`, versions as the
   lockfile has them), `markdown-adf.ts` and its tests: each node kind, nesting (a list in a quote, a code block in
   a list), task lists, tables, a link with emphasis inside, raw HTML, and a round trip through `adfMarkdown` that
   gives back the same markdown for an agent-style draft.
   Built: the `markdown` catalog holds `mdast-util-from-markdown` 2.1.0, `mdast-util-gfm` 3.1.0,
   `micromark-extension-gfm` 3.0.0 and, for the types, `@types/mdast` 4.0.4 (a dev dependency of core), all at the
   lockfile's versions: the lockfile gained only the references. `integrations/adf-types.ts` (the nodes Union
   writes), `markdown-adf-inline.ts` (marks; code keeps only a link, as ADF requires; soft breaks as spaces;
   images and references as links; HTML as its text), `markdown-adf-lists.ts` (lists, task lists with
   `union-<n>` local ids in document order, tables, and the blocks a list item or quote may hold, others as
   their text), `markdown-adf.ts` (`markdownAdf`). Tests in `markdown-adf.test.ts`, the round trip through
   `adfMarkdown` included. Nothing calls it until step 2.
2. **Creating the issue.** `createIssue` and its fake, the provider's `createItem`, `issueTypeId` and the default,
   `subtask`, `createsItems`, the connection check. Tests: the request's body, the default type, D4's error as
   `originError` (worker `investigation-ticket.test.ts` with a fake), D5's cuts, a project not connected refused by
   `requestTicket`.
   Built, with one change to D3: the provider has no database, so `createItem` reads the project's issue types
   from Jira when it creates (one more request; never stale), and picks the configured type if the project still
   has it, else Task, else its first type, sub-tasks left out (`jira-create.ts`: `issueTypeFor`,
   `cutDescription`, `createJiraIssue`). `JiraApi.createIssue` posts `fields: { project, issuetype, summary,
   description }` and returns the key. `JiraConfig.issueTypeId` is optional and an id (digits); `projectOf` and
   the stored types keep `subtask` (types read before count as plain ones). `requestTicket`'s connection check is
   a map per kind (`NOT_CONNECTED`). The worker's `withTargetItem` takes the `IntegrationApis`, and the
   investigation deps a `jira` client (a fake in `investigation-ticket.test.ts`). Once deployed, the
   investigation's switch offers Jira already (it lists the kinds that create items), with the default type
   until step 3's setting.
3. **Settings and the switch.** The issue type select; the switch shows for a Jira project. UI check
   (`scripts/ui-check/`): the select after Refresh, the switch beside Notion's, one on at a time.
   Built: `jira-issue-type-field.tsx` in the Jira settings (not in the setup wizard: the types are not known
   before connecting), the default as an empty value; the types come from the rules list's Jira source
   (`JiraRuleSource.issueTypes`, read by `useJiraRuleSource`), sub-tasks left out, the select disabled until the
   project is read. `JiraForm` carries `issueTypeId`, sent only when set. The settings' help no longer says
   Union only reads Jira. UI check on a scratch database (writes blocked): the select's options (Story and Task,
   not the sub-task), the saved config with `issueTypeId`, both switches on an answered investigation, one on at a
   time, and the request with `target: "jira"`.
4. **Real check and docs.** Ask the user first (it creates an issue in their Jira): an investigation on the SCRUM
   project with **Also create it in Jira**; check the issue in Jira (summary, description's headings and lists,
   type) and the ticket linked to it. Then `documentation/investigations.md`, `documentation/first-project.md`'s
   Connect Jira (the issue type), `docs/spec/investigations.md`, `docs/architecture/integrations.md`, this plan's
   status and `docs/plans/README.md`.

## Risks

- **Required fields vary per project.** D4 turns them into a message; a team whose Jira requires several fields
  would need Union to fill them, a later plan (the create screen's fields, as the rule actions read `editmeta`).
- **The parser's versions.** The three packages are pinned to what `remark-gfm` brings today; a later upgrade of
  `remark-gfm` may bring others, and the catalog then pins two copies until it is aligned.
- **Rich text differences.** Some markdown has no ADF counterpart (HTML, footnotes, images without upload): they
  read as text or links. The round-trip test of step 1 shows what changes.

## Later

- Fill the create screen's required fields (D4).
- Upload the ticket's files as the issue's attachments, for tickets with files (an investigation's have none).
- Create the issue for a ticket written by hand ("Also create it in Jira" in the New ticket dialog).
