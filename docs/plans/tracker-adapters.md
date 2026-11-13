# One adapter per tracker

Status: planned (2026-11-07), brought up to date 2026-11-13 after [tracker properties](archive/tracker-properties.md).
Step 1 built (2026-11-13, branch `tracker-adapters`).
Follows [Jira](archive/jira.md) and its gap plans, built and deployed; prepares a later
tracker (Linear, GitHub Issues as a source, Asana…).

## Why

The Jira integration took 37 commits although Union had an integration layer before it. That layer
(`IntegrationKind` in `integrations/kinds.ts`, `IntegrationProvider` in `integrations/provider.ts`) covers
connecting a project and importing an item: verify, read the fields, read an item, create one. Everything else Union
does with a tracker was written for Notion by name, so Jira added each feature again, through every layer:

| Group                                     | Commits | What it was                                                                                      |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| Connecting and importing                  | 3       | Client and provider, settings and wizard: what the layer made cheap.                             |
| The tracker's formats                     | 6       | ADF to markdown and back, attachments and media ids: specific to Jira, and stays so.             |
| Features Notion had, built again for Jira | 18      | Rule actions (7), comments tab (5), creating issues (2), linking afterwards (2), specs, reviews. |
| Plans and docs only                       | 10      | A plan per feature, its docs and the record of its real check.                                   |

When this plan was written, Notion had 63 files and Jira 81 under `apps/` and `packages/`, and 26 other source
files (tests left out) branched on `'notion'` or `'jira'` by name (56 places). On 2026-11-13, after tracker
properties, it is 76 and 97 files, and 31 files (66 places): each feature still lands twice. The generic pieces that exist (`tracker-link-form.tsx`, `tracker-tab.tsx`,
`tracker-files.ts`, `review-trackers.ts`, `review-specs.ts`'s `linkItem`) were extracted while building Jira.

## Since the plan: tracker properties

[Tracker properties](archive/tracker-properties.md) (built 2026-11-12) lets the user read and set a Notion page's
properties and a Jira issue's fields from the ticket's tab and a review's tabs. Its D8 chose to build it first and
leave it for this plan's step 3. It already has the tracker-neutral parts this plan wanted:

- `TrackerProperty` (core, `integrations/tracker-property.ts`): one property as a tab lists it, with its tracker
  type kept as text, its value as a rule writes it, its options and picks.
- The `set_tracker_fields` command (`integrations/tracker-field-set.ts`), carrying the tracker's kind, and the
  `tracker_field_set` / `tracker_field_failed` events.
- Shared value inputs between the rule editor and the tabs, and one property list and editor in the client
  (`tracker-properties.tsx`, `tracker-property-editor.tsx`, `tracker-property-row.tsx`).
- The properties a project hides, saved per integration (migration `0088_hidden_fields`).

It also added the per-tracker code this plan removes: one checker per tracker on the web
(`tracker-field-notion.ts`, `tracker-field-jira.ts`), one sender per tracker in the worker (`notion/field-set.ts`,
`jira/field-set.ts`), one input per tracker in the client (`notion-property-input.tsx`, `jira-property-input.tsx`,
`jira-status-input.tsx`), and reading the values (`notion-page-values.ts`, `jira-issue-values.ts`). Steps 3 and 4
below include them.

Built the same way, a Linear integration would take 20 to 25 commits: its text is already markdown, but each
feature would be added once more. The aim is that a new tracker is an adapter, its settings and its docs: 6 to 8
commits.

## What the user gets

Nothing changes on screen for Notion or Jira: the same tabs, rows, rule actions and texts. What changes is that a
new tracker gets every feature its adapter supports at once, the same way in every place.

## Decisions

- **D1. An adapter declares what it can do.** `TrackerAdapter` (core, `integrations/tracker-adapter.ts`) extends
  `IntegrationProvider` with optional capabilities, each a group of calls:
  - `comments`: read an item's comments (as markdown, with author, link, restriction) and post one or a reply;
  - `status`: the source's statuses, and moving an item to one (Notion sets its status property, Jira finds the
    transition), with the moves offered from where the item is (Jira's tab reads its transitions);
  - `fields`: an item's properties as `TrackerProperty` rows, the settable fields as shared field types (D2), the
    lists a picked field offers, checking a value and setting it;
  - `refs`: parsing a key or link, `refError` (another site), the keys a text names (suggestions, as `jira-keys.ts`);
  - `text`: the item's text as markdown, and markdown to the tracker's format (`markdownAdf`, Notion's rich text);
  - `files`: the item's attachments, through `tracker-files.ts`.
    Features ask for a capability (`adapter.comments`), never for a tracker by name. `IntegrationKind` keeps what the
    browser needs (labels, `parseRef`, `createsItems`) and gains the capability names, so the client shows what the
    adapter supports.
- **D2. One set of field types.** Notion properties, Jira fields and GitHub Project fields are three typed value
  systems today (`NotionValue`, `JiraFieldValue`, `ProjectFieldValue`). Rule fields share one: `text`, `textarea`,
  `number`, `date`, `datetime`, `select`, `multi_select`, `people`, `labels` (added), `picked` (versions,
  components, sprints: ids with names, as Jira's `picks`). Each adapter maps its own types to them and shapes the
  values it sends (`jira-values.ts` becomes Jira's mapping). `TrackerProperty.type` becomes one of these types,
  with the tracker's own type kept for display; the client then picks a value input by shared type, not by tracker.
  GitHub Project fields move to them in a later step (D7).
- **D3. Rule actions name the tracker, not the reverse.** `tracker_status`, `tracker_fields` and `tracker_comment`,
  each with `tracker: IntegrationKindName`, replace `notion_property`, `jira_transition`, `jira_field` and
  `jira_comment`. One editor (`tracker-action-fields.tsx`), one preview, one worker delivery over the adapter.
  The delivery and a property set by hand (`set_tracker_fields`) share the adapter's `fields.set`, so a value is
  shaped and sent one way whether a rule or the user set it. A
  migration rewrites the stored rules' actions (`event_rules.action`); the old kinds are read for one release, then
  dropped. Deliveries already logged keep their text.
- **D4. Routes and components take the tracker as a parameter.** `/api/tickets/:id/trackers/:kind/comments`,
  `…/link`, `<review>/trackers/:kind`, `/api/projects/:id/trackers/:kind/picks/:type`; one ticket tab, one Overview
  row, one review row and tab, picked by the ticket's origin or the review's links. The property routes
  (`/api/tickets/:id/tracker-fields`, `<review>/tracker-fields`) already take the kind in their body and stay as
  they are; only their per-tracker checkers go behind the adapter. Ticket origins (`origin_kind`)
  and review specs (`SPEC_SOURCES`) already store the kind: they read it from the adapters' registry
  (`integrations/providers.ts`) instead of a list.
- **D5. One contract test suite.** `integrations/adapter-contract.ts` (test helpers) runs the same cases against each
  adapter's fake API: import an item, link one, refuse another site's link, read and post comments, move a status,
  set each field type, read a spec, suggest keys. A new adapter is done when it passes them; its own tests cover
  only its formats.
- **D6. An ast-grep rule keeps features tracker-neutral.** `no-tracker-names`: no `'notion'` or `'jira'` literal
  outside `integrations/` (core), the adapters' folders and their settings components. Its `note` gives the reason to
  ask for before widening `ignores`, as the repo's other rules do.
- **D7. GitHub Project fields join later.** They are not a tracker (no import, no comments), but their field rule is
  the third copy of the same editor; once D2 is built, `github_project_fields` uses its types and editor.
- **D8. One guide page for trackers.** `documentation/` gets a "Trackers" page (connect, import, link, comments, rules,
  reviews) with a short section per tracker for what differs (Jira's transitions and sprints, Notion's properties);
  the per-tracker pages keep only their setup.

## Steps

Each step moves Notion and Jira together, keeps the screens as they are, and is deployed on its own.

1. **The adapter and its contract.** `TrackerAdapter` (D1) with `refs` and `text`; Notion and Jira adapters
   wrapping their providers; the contract suite (D5) for these two capabilities; the registry. No caller changes.
   Built: `text` reads only (the tracker's markdown as plain markdown). Markdown to the tracker's format moves to
   step 2, where comments use it: Notion takes two formats (rich text for a comment, markdown for a new page), so the
   capability is shaped by its calls rather than guessed. The kinds name their capabilities, and the contract
   checks the adapter has those. The fakes are new (`fake-notion-api.ts`, `fake-jira-api.ts`); the providers' own
   tests keep their inline fakes until a step touches them.
2. **Comments.** The `comments` capability; one comments route and one ticket tab (D4) for both; the post commands
   (`post_notion_comment`, `post_jira_comment`) become `post_tracker_comment` (the worker reads the old names for one
   release, so commands queued before the deploy still run). Add to review over the adapter.
3. **Shared field types, rule actions and properties.** D2 and D3: the types, Notion's and Jira's mappings, the
   three tracker actions, the editor, previews, the worker's delivery; the migration of stored rules; tests that
   every saved rule reads the same before and after. The `fields` and `status` capabilities also take over tracker
   properties: reading an item's properties (`notion-page-values.ts`, `jira-issue-values.ts` become the adapters'),
   the web's check (`tracker-field-notion.ts`, `tracker-field-jira.ts` become one call), the worker's send
   (`notion/field-set.ts`, `jira/field-set.ts` become one), and one value input by shared type in place of
   `notion-property-input.tsx` and `jira-property-input.tsx` (Jira's status keeps its transitions, through
   `status`). The command and its events keep their names. Real check of one rule and one property set per tracker
   after asking (it writes to the user's Notion and Jira). The largest step: if it does not fit one deploy, split
   it into 3a (types, mappings and properties) and 3b (rule actions and their migration).
4. **Linking, specs and reviews.** The Overview row, review specs, a review's links, suggestions and tab over `refs`
   and `text` (D4), and one item card in the ticket's and the review's tabs (`notion-page-card.tsx`,
   `jira-issue-card.tsx` into `tracker-item-card.tsx`). Removes `review-notion*.ts`, `review-jira*.ts`,
   `ticket-notion-link.ts`, `ticket-jira-link.ts`, `use-review-notion.ts`, `use-review-jira.ts` and their client
   files.
5. **Creating items and files.** `createItem` and attachments through the adapter; the investigation's "Also create
   it in" for every adapter that can.
6. **The guard and the guide.** The ast-grep rule (D6) with its cases, set to fail; the Trackers page (D8);
   `docs/architecture/integrations.md` describes adapters; this plan's status.
7. **GitHub Project fields (optional).** D7.

After step 6, a new tracker is: its API client and fake, its adapter (mappings and formats), its settings section,
its guide section, and the contract suite passing.

## Risks

- **A generic shape that fits neither tracker.** Statuses differ (Notion sets a property, Jira walks a workflow);
  the capability says what the user picks (a status) and leaves how to the adapter. Where a tracker has something
  the others do not (Jira's sprints, Notion's people from workspace members), it is a field type or a picked list
  the adapter fills, not a new capability.
- **Stored rules.** The step 3 migration rewrites JSON in `event_rules`; it is tested against copies of every
  action shape saved so far, and the backup is taken before deploying, as for every deploy.
- **A large diff on the live instance.** Each step is built in a worktree, checked with the UI check (writes blocked)
  and deployed alone; steps 3 and 4 touch the most files and are deployed when nothing runs.
- **Cost.** About 10 to 14 commits for steps 1 to 6 (step 3 grew with tracker properties). Worth it if a third
  tracker is likely; if not, steps 1, 3 (fields, rules and properties) and 6 (the guard) alone stop the copies from
  growing: step 3 needs the adapter of step 1.
- **The copies keep growing while this waits.** In the week after this plan, 30 Notion and Jira files were added, 19 of them by tracker properties. A
  feature built for both trackers before step 3 lands should go behind a tracker-neutral command and a shared
  component, as tracker properties did, so it moves behind the adapter without being rewritten.
