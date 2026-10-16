# Idea: Events v2

Status: ideas left out of Events v1 (`9bfae3b`). "More actions" is planned below: step 1 (one handler per
action kind) and its first new target (a GitHub comment on the issue or the PR, the rule picks) are done; targets
2 to 5 and the rest are not started.

Events v1: rules on a project, triggered by ticket events, setting one property of the ticket's Notion page (tickets
imported from Notion only), applied to events logged after the rule's creation.

## More actions: targets other than Notion

Only the action is tied to Notion. Triggers are ticket events and match any ticket; the delivery queue
(`event_deliveries`), its retries, the Log line and the deliveries list are generic; the template variables describe
the ticket. `event_rules.action` is a JSON column, so a new action kind needs no migration (existing rules keep
`kind: 'notion_property'`).

### Where Notion is assumed today

- `packages/core/src/event-rule-types.ts`: `EventAction` has one kind, `notion_property`.
- `packages/core/src/event-rules.ts`: `checkedAction` requires the stored Notion schema and a property id.
- `apps/worker/src/event-dispatcher.ts`: `targetOf` skips tickets without `notionPageId`; `deliver` always calls
  `notion.updatePage`; retries are decided from `NotionError`; `PER_TICK = 3` is Notion's rate limit.
- `apps/web/src/routes/event-rules.ts`: `previewOf` answers "not imported from Notion" for any other ticket.
- `apps/web/client/components/settings/`: `events-section.tsx` disables Add rule until the Notion columns are read;
  `rule-editor.tsx` and `value-field.tsx` only pick a Notion property.

### Step 1: one handler per action kind (refactor)

1. Core, browser-safe: `EventAction = NotionPropertyAction | GitHubCommentAction | …`, with a label per kind and
   the ticket sources it applies to.
2. Core: `checkedAction` dispatches on the kind; only the Notion kind needs the Notion schema.
3. Worker: an `ActionTarget` (`deliver(due) → DeliveryOutcome`), one file per kind (`event-actions/notion.ts`, …).
   The dispatcher picks the target from `rule.action.kind`; each target owns its retry rules and its pace.
   `side-runs.ts` builds the dispatcher and already has `deps.apiFor(project)` for GitHub.
4. Web: the preview dispatches on the kind.
5. UI: an Action picker, and one fields component per kind in its own file (`rule-editor.tsx` is at 244 lines).
   Add rule needs Notion only for a Notion action.

No behaviour change for existing rules; the dispatcher and rule tests keep passing unchanged.

### Step 2: the targets, cheapest first

1. **Comment on the ticket's GitHub issue or PR** (first new kind). Every ticket has an issue (imported from Notion,
   from a GitHub issue, or created in Union); `GitHubApi.createComment` exists and takes PR numbers too; the
   project's credentials are already resolved; no new secret. Example: PR ready → "Ready for QA: {pr.url}".
2. **Label on the issue or PR**: add `addLabels` / `removeLabel` to `GitHubApi` (and the fake). For automations on
   the GitHub side ("PR merged → `deployed-to-staging`").
3. **A GitHub Project field**: the worker already sets Status; other single-select, text or date fields follow the
   same path. Needs the Project's fields read and stored, as the Notion columns are.
4. **Outgoing webhook** (Slack, Discord, Teams, any URL). Deferred (2026-10-16): no external service to connect
   yet; [notifications in Union](notifications.md) come first. A webhook URL is a credential, and `listRules` sends rule
   actions to the browser, so it cannot live in the rule: a per-project destinations table, written by the web and
   read by the worker, with the browser seeing names only (like `toPublicProject` for tokens). Body as a text or
   JSON template.
5. **Comment on the ticket's Notion page**: one more `NotionApi` endpoint; Notion-imported tickets only.

Linear or Jira would first need their tickets imported into Union; a webhook covers part of the need until then.

### Testing

Automated tests use the fake GitHub API (`apps/worker/src/github/fake-api.ts`). A check against a real project posts
on its issues: ask before running it.

## Several Notion properties in one rule

Status: built (2026-10-16, branch `notion-multi-properties`). A Notion action used to set one property, so setting
several on the same event took one rule each. The Notion action holds a list instead; one rule, one delivery, one
Notion request.

1. **Shape** (`packages/core/src/event-actions.ts`): `notion_property: { values: { propertyId: string; value:
   string }[] }`, labelled "Set properties of the ticket's Notion page".
2. **Existing rules**: a drizzle migration rewrites the stored `{ propertyId, value }` (and the oldest rows, without
   a `kind`) into `values: [{ propertyId, value }]`, so the type has one shape and no reader normalizes. After it:
   `bun run active`, then restart web and worker.
3. **Checks** (`checkedNotionAction` in `event-rules.ts`): at least one entry, no property twice; each entry gets
   today's checks (property in the data source, no variables for people, unknown variables, value shape), and the
   error names the property (`Status: "Foo" is not a status…`). The Notion action's checks and values are in their own core
   file, `event-notion-action.ts` (`event-rules.ts` is near 300 lines).
4. **Worker** (`apps/worker/src/event-actions/notion.ts`): render every value, then one `notion.updatePage` with
   all the properties: one request for the rate limit, applied together by Notion. One value that cannot be
   rendered fails the whole delivery, naming the property (all or nothing: no half-set page). Detail:
   `Status set to "Done", PR set to "https://…"`.
5. **Preview** (`RulePreview` in `apps/web/src/event-api-types.ts`, `routes/event-rules.ts`): the Notion kind holds
   `properties: { name, text, value }[]`; `rule-preview.tsx` shows one line per property.
6. **UI**: `notion-action-fields.tsx` becomes a list of rows (property select, `ValueField`, remove) with "Add a
   property"; a property used by one row is not offered in the others. The row in its own file
   (`notion-value-row.tsx`); "Add a property" waits until every row has its property. `rule-action-text.tsx`
   names two properties and counts the others ("and 1 more").
7. **Tests**: `event-rules.test.ts` (several values, a duplicate, an empty list, the migrated shape); the worker's
   Notion target (one `updatePage` with all the properties, a failure naming the bad property). Update the Events
   part of `docs/architecture/` and the maps.

Not chosen for now: several actions per rule (`actions: EventAction[]`, for example set Notion properties and
comment on GitHub in one rule). It needs one delivery per action (the unique key on `rule_id, event_seq` changes),
retries per action, and an editor listing actions of mixed kinds. Worth it only if mixing kinds is wanted.

## Pull request properties and GitHub Project fields

Status: built (2026-10-16, branch `pull-request-rule-actions`): the pull request action, then the Project fields
action. Covers targets 2 and 3 of step 2 above, for the pull request. A rule can
change several things of the ticket's pull request at once (labels, reviewers, assignees, title, description), and
set GitHub Project fields on the issue's item or the PR's item (the rule picks).

Two new action kinds, each a list of changes like the Notion action (one rule, one delivery):

- `github_pull_request`, "Update the ticket's pull request": `changes: PullRequestChange[]`, one of each kind at
  most:
  - `{ kind: 'labels', add: string[], remove: string[] }`: label names; a label that does not exist yet is created by
    GitHub on add.
  - `{ kind: 'reviewers', users: string[] }`: request reviews (logins). Teams later (needs `read:org`).
  - `{ kind: 'assignees', users: string[] }`: add assignees (logins).
  - `{ kind: 'title', value: string }`: a template.
  - `{ kind: 'description', value: string }`: a template, written as a section of the description between
    `<!-- union-rule:<ruleId> -->` markers: added once, replaced on the next delivery, so a retry or a second
    trigger never repeats it, and the rest of the description is kept.
- `github_project_fields`, "Set fields of the ticket's GitHub Project item": `item: 'issue' | 'pull_request'`,
  `values: { fieldId: string; fieldName: string; fieldType: string; value: string }[]` (like the Notion values). Types: single
  select (option name), text, number, date (templates allowed; single select by name). The project is the one Union
  syncs (`githubProjectNodeId`). The PR item is added to the project on first use (`addProjectV2ItemById` returns
  the existing item when there is one). **Status on the issue's item is refused**: Union's sync owns it.

A rule on a ticket without a pull request is skipped ("The ticket has no pull request"), as for comments.

### Steps

1. **Core, browser-safe** (`event-actions.ts`, plus `event-github-actions.ts` for the checks: `event-actions.ts` is
   near its import and length limits): the two kinds, labels, empty values, checks (at least one change, logins and
   label names well formed, unknown variables, no Status on the issue item). Tests next to them.
2. **Worker, pull request** (`event-actions/github-pull-request.ts`): `GitHubApi` gets `addLabels`, `removeLabel`,
   `requestReviewers`, `addAssignees`, `updatePullRequestTitle` (`pullRequestBody` and `updatePullRequestBody`
   exist); the fake gets them too. One delivery does the changes in order; a temporary error retries the whole
   delivery (every change is idempotent), a refusal fails it and the detail says which changes were done. One per
   tick, as comments.
3. **Worker, Project fields** (`event-actions/github-project-fields.ts`): `GitHubApi.projectFields(projectNodeId)`
   (id, name, type, options) generalizing `getProjectInfo`, `pullRequestNodeId`, and `setProjectField` by type. The
   issue's item is `tickets.project_item_id`; the PR's is added. A field or option gone from the project fails the
   delivery and names it.
4. **Web**: `OnboardingGitHub` reads what the editor offers, live (no stored copy): the repo's labels, the
   assignable users, the project's fields. Endpoints under `/api/projects/:projectId/github/…`. The rule keeps each
   field's id, name and type, so the save checks the values' shape without GitHub; a field or option gone from the
   Project fails the delivery, naming it. Preview for both kinds (what would change,
   nothing sent).
5. **UI**: a fields component per kind (`pull-request-fields.tsx` with a row per change, `project-field-row.tsx`
   like `notion-value-row.tsx`), the rule's sentence in `rule-action-text.tsx`, and the preview.
6. **Docs and maps**; a check against a real project changes its pull requests: ask before running it.

## Left for later

- **Replay:** apply a new rule to past events (with a preview of what it would change, and a cap).
- **Filters:** conditions on a rule (for example only tickets with a label, or only some board columns).
- **Group triggers** once [ticket groups](ticket-groups.md) exist: "every PR of the group is merged".
- **Person properties from variables:** today a person property takes fixed people; mapping a GitHub user to a Notion
  user would allow "whoever opened the PR".
