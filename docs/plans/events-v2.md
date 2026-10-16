# Idea: Events v2

Status: ideas left out of Events v1 (`9bfae3b`). "More actions" is planned below; the rest is not started.

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
4. **Outgoing webhook** (Slack, Discord, Teams, any URL). A webhook URL is a credential, and `listRules` sends rule
   actions to the browser, so it cannot live in the rule: a per-project destinations table, written by the web and
   read by the worker, with the browser seeing names only (like `toPublicProject` for tokens). Body as a text or
   JSON template.
5. **Comment on the ticket's Notion page**: one more `NotionApi` endpoint; Notion-imported tickets only.

Linear or Jira would first need their tickets imported into Union; a webhook covers part of the need until then.

### Testing

Automated tests use the fake GitHub API (`apps/worker/src/github/fake-api.ts`). A check against a real project posts
on its issues: ask before running it.

## Left for later

- **Replay:** apply a new rule to past events (with a preview of what it would change, and a cap).
- **Filters:** conditions on a rule (for example only tickets with a label, or only some board columns).
- **Group triggers** once [ticket groups](ticket-groups.md) exist: "every PR of the group is merged".
- **Person properties from variables:** today a person property takes fixed people; mapping a GitHub user to a Notion
  user would allow "whoever opened the PR".
