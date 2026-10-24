# Ticket source integrations

Status: steps 1 and 2 built (branch `source-integrations`, 2026-10-24); steps 3 to 6 planned. Decisions D1 to D7
proposed, to confirm. A refactor: no behaviour change until a
second kind (Jira, Linear) is added.

## Why

Notion is wired in as a special case: its secret is a column of `projects`, its data source a field of
`ProjectConfig`, its columns a table of their own, and a ticket's page a column of `tickets`. A second ticket source
(Jira, Linear) would need a copy of each, and every place that asks "is this ticket from Notion?" a second branch.
The plans for [Notion comments](notion-comments.md) and [a review's Notion page](review-notion-link.md) add more
Notion-only fields on the same path.

The pieces already generic stay as they are: event rule actions are one handler per kind
([Events v2](events-v2.md) step 1), the delivery queue and its retries, the template variables, ticket flows, and
everything downstream of a ticket existing. What is missing is a model for "a project connected to an outside
tracker" and "a ticket that came from one".

## What does not change

- **GitHub stays the source of truth** (`docs/spec/stack.md`): every ticket is a GitHub issue and Project item, the
  board status is the Project's. An integration is an **origin** (tickets are imported from it, once; its text is
  copied, not synced) and a **target** (event rules and investigations write to it). GitHub is not an integration:
  its credentials, `issueNumber` and the PR stay where they are.
- Reads from the web, writes from the worker; secrets never reach the browser.
- Event rule actions stay one kind per place they act on (`notion_property`, later `jira_field`): what a field can
  hold differs too much between trackers to share one action.

## Where Notion is wired in today

| What                        | Where                                                       | Becomes                                    |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| Secret                      | `projects.notion_token`                                     | `integrations.secret`                      |
| Data source                 | `ProjectConfig.notionDataSourceId`                          | `integrations.config` (`{ dataSourceId }`) |
| Columns as last read        | table `notion_data_sources`                                 | `integrations.fields`, `fields_read_at`    |
| Ticket's page               | `tickets.notion_page_id`                                    | `tickets.origin_kind`, `origin_id`         |
| Investigation's ticket page | `investigations.ticket_in_notion`                           | `investigations.ticket_target` (a kind)    |
| "Is it connected?"          | `PublicProject.hasNotion`                                   | `PublicProject.integrations`               |
| Spec source                 | `SPEC_SOURCES` value `'notion'`                             | unchanged value, from the kind             |
| Web routes                  | `/api/notion/verify`, `/api/notion/import`, settings fields | `/api/projects/:id/integrations/:kind/…`   |

About 75 files mention Notion; most are UI and tests that follow from these. The tests that guard the behaviour
(`notion-routes.test.ts`, `event-dispatcher.test.ts`, `investigation-ticket.test.ts`, `event-rules.test.ts`,
`investigation-tickets.test.ts`) must keep passing with only their setup changed.

## Design in short

- **One table**, `integrations`: `id`, `project_id`, `kind` (`'notion'`), `secret` (never sent to the browser),
  `config` (JSON, typed per kind), `fields` (JSON: the tracker's columns as last read, typed per kind), `title`
  (the data source's or Jira project's name, for the UI), `fields_read_at`, timestamps. Unique on
  `(project_id, kind)`.
- **A ticket's origin**: `tickets.origin_kind` (null: written in Union or imported from a GitHub issue) and
  `tickets.origin_id` (the Notion page id, later the Jira issue key), with `origin_url` for links. A ticket has one
  origin.
- **A provider per kind**, in core, behind one interface (D3). Notion's is a thin adapter over the existing
  `NotionApi`, which stays the HTTP client and keeps its fake.
- **Generic routes** for what every kind does (verify the connection, read the fields, look up an item to import,
  import it); kind-specific UI only where the kinds really differ (the rule action fields, the settings form).

## Decisions (proposed)

- **D1. One integration per kind per project.** Two Notion data sources on one project is not asked for, and the
  unique index keeps lookups simple (`integrationOf(db, projectId, 'notion')`). Lifting it later means an id on the
  ticket origin instead of a kind.
- **D2. Origin columns on `tickets`, not a links table.** A ticket is imported from one place; a join table would
  answer a question nobody asks yet. The [review's Notion page](review-notion-link.md) uses the same pair of columns
  on its own table (`origin_kind`, `origin_id`), so it is generic from the start.
- **D3. The provider interface** (`packages/core/src/integrations/provider.ts`), split by who calls it:

  ```ts
  /** Browser-safe: what the UI needs to know about a kind. */
  type IntegrationKind = {
    kind: 'notion';
    label: string; // "Notion"
    itemLabel: string; // "page"
    parseRef(input: string): string | null; // URL or id → id
    cleanMarkdown(markdown: string): string; // notionMarkdown
  };

  /** Server-side: the calls Union makes, with the secret and config of one integration. */
  type IntegrationProvider = {
    verify(secret: string, config: unknown): Promise<{ title: string }>;
    readFields(secret: string, config: unknown): Promise<unknown>; // stored as `integrations.fields`
    item(secret: string, config: unknown, id: string): Promise<SourceItem>; // refuses items outside config
    createItem?(
      secret: string,
      config: unknown,
      item: { title: string; markdown: string },
    ): Promise<SourceItem>;
  };

  type SourceItem = {
    id: string;
    title: string;
    url: string;
    markdown: string;
    truncated: boolean;
  };
  ```

  Writes of fields stay in the rule action's own target (`event-actions/notion.ts`), which takes the integration
  row instead of the project. Comments ([Notion comments](notion-comments.md)) would be an optional
  `comments?`/`postComment?` pair, added when that plan is built.

- **D4. Config and fields are typed per kind, checked at the edge.** `config` and `fields` are JSON whose shape
  depends on `kind`; a type guard per kind (`notionConfigOf(row)`) reads them, so no `unknown` leaks past the
  provider. No generic "field" model across trackers.
- **D5. Data migration in SQL, old columns dropped later.** One migration creates `integrations` and the origin
  columns and copies the data (`INSERT … SELECT` from `projects` where `notion_token` is set, joined with
  `notion_data_sources`; `UPDATE tickets SET origin_kind = 'notion', origin_id = notion_page_id`). The old columns
  and table are left unused, then dropped in a second migration once the live instance has run on the new ones
  (step 6). `json_remove(config, '$.notionDataSourceId')` goes in that second one.
- **D6. The public project lists its integrations.** `PublicProject.integrations: { kind; title; ready }[]` replaces
  `hasNotion` (`ready`: secret and config set, fields read). The client asks `integrationOf(project, 'notion')`.
  The secret is stripped in one function, `toPublicIntegration`, as `toPublicProject` does.
- **D7. Notion keeps its own screens.** The settings form, onboarding step and rule action fields stay Notion's
  components, moved under a per-kind folder (`settings/integrations/notion/`). The New ticket dialog's import and
  the investigation's "Also create it in …" become one component that lists the project's integrations. A Jira
  form is written when Jira is.

## Steps

Each step ships on its own and leaves Notion working as before; run `bun run check` and the Notion tests after each.

1. **Core interface, no schema change.** `integrations/kinds.ts` (browser-safe registry: `notion` with label,
   `parseNotionId`, `notionMarkdown`), `integrations/provider.ts` (D3), `integrations/notion-provider.ts` (adapter
   over `NotionApi`, page-in-data-source check moved here from `routes/notion.ts`). Tests with the fake
   `NotionApi`. Keep each file under the 10-import limit: the registry imports only browser-safe code.
2. **Schema and migration (D5).** `integrations` table in a new `schema-integrations.ts`, origin columns on
   `tickets`, `ticket_target` on `investigations`; `bunx drizzle-kit generate`, then the data copy appended to the
   generated SQL. Test the migration on a copy of a database with a Notion project (`db:backup`, migrate the
   copy, compare counts). On the live instance: `bun run active`, backup, then restart `web` and `worker`.
   Built: migration `0070_source_integrations` (test in `integrations-migration.test.ts`; on a copy of the live
   database the Notion connection with its 65 columns, 13 ticket pages and 3 investigation targets copied). Nothing
   writes the new columns yet, so a Notion import or connection made between this migration and step 3 would be
   missing from them: deploy steps 2 and 3 together.
3. **Switch reads and writes to the new model.** Core: `integrationOf`, `saveIntegration`, `forgetFields`
   (replaces `forgetNotionSchema`), `notionSchemaOf` reading `integrations.fields`. Worker:
   `event-actions/notion.ts`, `investigation-ticket-notion.ts`, `event-deliveries.ts` (setting the origin of a
   created page). Web: `ticket-create.ts`, `grouping-targets.ts`, `rule-previews.ts`, `spec-sources.ts`,
   `event-rules.ts`. `createTicket` takes `origin?: { kind; id; url }` instead of `notionPageId`.
4. **Generic routes and the public project (D6).** `routes/integrations.ts`:
   `POST /api/projects/:id/integrations/:kind/verify`, `PUT …/:kind` (secret and config),
   `DELETE …/:kind`, `POST …/:kind/fields` (refresh), `POST …/:kind/import`. Project creation takes
   `integrations: [{ kind, secret, config }]`. The old `/api/notion/*` routes and the `notionToken` /
   `notionDataSourceId` fields of the settings route go in the same step, with the client.
5. **Client.** `api.ts` (`integrations` namespace), `hasNotion` → `integrationOf`, the import component in the New
   ticket dialog and investigations (D7), Notion settings and onboarding moved under `integrations/notion/` and
   calling the generic routes, `ticket-details.tsx` / `ticket-description.tsx` reading `originKind`. Check with
   `scripts/ui-check/`: the Notion settings, the New ticket import, a Notion ticket's panel, an event rule preview.
6. **Drop the old columns** (`projects.notion_token`, `tickets.notion_page_id`, `investigations.ticket_in_notion`,
   table `notion_data_sources`, `config.notionDataSourceId`) in a second migration, after the live instance has run
   on step 5. Update `docs/architecture/integrations.md`, `database.md`, `web.md`, `worker.md` and
   `docs/spec/flow.md`, `investigations.md`.

Steps 1 to 3 are the bulk of the risk (data and worker); 4 and 5 are mostly renames that the type checker drives.

## Adding Jira afterwards (to check the interface fits, not part of this plan)

- `kinds.ts` entry and `jira-provider.ts` over a `JiraApi` (REST v3, API token + email + site, or OAuth), with a
  fake for tests. `config`: `{ site, projectKey, email }`; `fields`: the project's fields and the statuses of its
  workflow.
- `cleanMarkdown`: Atlassian Document Format to markdown (a pure converter, its own tests).
- An action kind `jira_field` (set fields) and maybe `jira_transition` (move the issue's status), each a target
  in `event-actions/`; template variables are unchanged.
- `'jira'` in `SPEC_SOURCES`, a settings form and an onboarding step under `integrations/jira/`.
- Images: Jira attachments need the secret to download, unlike Notion's signed links; `fetchNotionImages` becomes
  a provider method then.

If one of these needs a change to the interface of D3, that is the time to make it, not before.

## Order with the other Notion plans

[Notion comments](notion-comments.md) and [a review's Notion page](review-notion-link.md) are planned, not built.
Build at least steps 1 to 3 first, so they read the integration and the ticket's origin instead of adding
`notionToken` and `notionPageId` uses; `review-notion-link` takes `origin_kind` / `origin_id` (D2).
