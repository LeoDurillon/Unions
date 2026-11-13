# Edit the tracker item's properties from the ticket

Status: planned (2026-11-13). Builds on the Notion and Jira tabs (comments, built) and the rules' field
machinery ([Jira rule actions](archive/jira-rule-actions.md), [More Jira fields](archive/jira-more-fields.md)).
Overlaps [One adapter per tracker](tracker-adapters.md): see D8.

## Why

A ticket's Notion or Jira tab shows the item's comments, and the Notion card one value (its status column). To
change anything else on the page or issue (the assignee, a priority, a sprint, a date, the status) the user opens
the item in Notion or Jira. Event rules can already set these fields, so Union knows how to read each type, shape a
value and send it; only a rule can use that today, not the user by hand.

## What the user gets

- The Notion tab's page card and the Jira tab gain a **Properties** list under the heading: each property or field
  with its current value, read from the tracker when the tab opens (and on Refresh), as the comments are. Every
  property is listed; the empty ones are folded under "N empty", opened with one click.
- Each one the tracker lets Union set has an edit button: a value input fitting its type (text, number, date, a
  select's options, people from the workspace or the project's assignable users, versions, components, a sprint),
  then Save or Cancel. Properties Union cannot set (formulas, rollups, created by…) show their value only.
- On Jira, the status is changed with the transitions the issue offers from where it is (the same list as in
  Jira's own status button), not a free list of statuses.
- While a change is being sent, the property shows the new value with "Saving…"; once the worker has sent it, the
  tab reads the item again. A refused change (an option removed, a workflow that needs a screen) shows Jira's or
  Notion's reason on the property, and the old value is kept.
- A pull request under review's Notion and Jira tabs show the same list, editable, for each linked page or issue,
  under its title.

## Decisions

- **D1. The web reads, the worker writes.** As for comments: `GET` reads the values from the tracker now (web, read
  only); a change is a row in `commands` the worker sends. The command is `set_tracker_fields`
  (`{ kind: 'notion' | 'jira', itemId, values }`), named after the tracker as the adapters plan names its commands,
  so it does not need renaming later. It names where the change was made, `{ ticketId }` or `{ reviewId }`, and
  the worker checks the item is the ticket's origin or one of the review's linked items before sending. The pending changes are the queued commands not answered yet, as
  `pending-comments.ts` does for comments.
- **D2. Values as the rules already shape them.** Notion: `notionPropertyValue` (`WRITABLE_NOTION_TYPES`); Jira:
  `jiraFieldValue` and the worker's `pickedValue`. A value typed by hand is a template without variables: the same
  checks run, `{…}` is taken literally (no `renderTemplate`). No second set of value code.
- **D3. Which properties.** Notion: the data source's properties as stored (`notionSchemaOf`), their values read
  from the page object (`GET /v1/pages/{id}`, already called for the card). Jira: the issue's edit screen
  (`GET /issue/{key}?expand=editmeta&fields=…`, one call: values and what is settable), restricted to the field
  types `jira-field-types.ts` knows. Every property is listed, settable or not, the empty ones folded; no
  per-project choice of which to show. Title and description stay out (the ticket's own title and description are
  Union's; editing the item's text is another feature).
- **D4. One property per change, only what changed.** A Save sends that one property: someone editing the page in
  Notion at the same time loses nothing else. Neither API has a conditional write, so the last write of a property
  wins, as in their own UIs; the tab reads the item again after each change so the user sees what it holds.
- **D5. Jira's status through transitions.** The status row lists `GET …/transitions` (read when it is edited) and
  the worker calls `transitionIssue`. A transition with a required screen field fails with Jira's reason; Union
  does not show transition screens.
- **D6. Logged, not a rule trigger.** The worker logs `tracker_fields_set` and `tracker_fields_failed` (declared in
  `event-payloads.ts`) with the ticket (or the review), the property and the value as text, so the ticket's activity says who
  changed what. They are not offered as rule triggers: a rule reacting to them could loop with a rule that sets
  fields.
- **D7. Shared value inputs.** The rule editor's value inputs (`notion-value-row.tsx`, `jira-field-row.tsx`,
  `jira-pick-field.tsx`) are split so the input itself (by type, with its option and pick lists) is one component
  the rule rows and the tab both use, with variables offered only in the rule editor.
- **D8. With the adapters plan.** If [tracker adapters](tracker-adapters.md) step 3 (shared field types) is built
  first, this feature is one `fields` capability call and one component for both trackers. If this is built first,
  it stays within the two trackers' folders, keeps the tracker-neutral command (D1), and the adapters plan's step 3
  moves it behind the capability with the rule actions. Recommendation: build this first, it is what the user sees;
  it adds no new copy of the value code (D2, D7).

## Steps

Each step is deployed on its own, built in a worktree.

1. **Read the values.** Notion: `notion-page-values.ts` (core) reads each property of the page object as text and
   as the value an input starts from; the tab's view gains `properties`. Jira: `issueFields` in `jira-api.ts` with
   `expand=editmeta`, `jira-issue-values.ts` reads them by type; the Jira tab gains a header card like Notion's.
   Both lists read only. Tests with recorded responses for every type.
2. **Shared value inputs.** D7: the inputs split out of the rule rows, the rule editor unchanged (UI check of the
   Events page).
3. **Edit on Notion.** The command and its check in core (`tracker-field-set.ts`, browser-safe like
   `notion-comment-post.ts`), `POST /api/tickets/:id/tracker-fields`, the worker's handler
   (`apps/worker/src/tracker/fields-set.ts`) over `updatePage`, the events, the pending state and the editor in the tab. Real check on one
   property of a page the user picks, after asking.
4. **Edit on Jira.** The same command for Jira over `updateIssue` (fields set, labels set as a whole here, not
   added), picks from `use-jira-picks.ts`, and the status through transitions (D5). Real check after asking.
5. **On a review's tabs.** The list in `review-notion-tab.tsx` and `review-jira-tab.tsx`, one per linked page or
   issue, over the same component and hook; the routes `<review>/notion` and `<review>/jira` gain the values (D3),
   and the command takes `{ reviewId }` (D1). UI check, then a real check after asking.
6. **Docs.** `documentation/tickets.md` (the Notion and Jira tabs: what can be changed and how), the guide's page
   on a review's tabs, the spec of the ticket panel and `docs/spec/pull-requests.md`, `docs/architecture/integrations.md` (a new write the worker does), this plan archived.

## Risks

- **Rate limits.** Notion allows about three requests a second; a user clicking through properties sends one each.
  The worker sends them in order and retries a 429 as the rule action does.
- **Stale columns.** A property added to the data source after the last Refresh from Notion is not in the stored
  schema: the tab reads the page's own property list for names and types, and uses the stored schema only for a
  select's options, saying when they may be out of date (Refresh from Notion in the Events settings).
- **Jira screens.** The edit screen differs by issue type and project; `editmeta` is read per issue, so the list is
  right for each issue, but a field missing from the screen is not shown even when the issue has a value.
- **File sizes.** `notion-tab.tsx`, `jira-tab.tsx` and `jira-api.ts` are near the limits: the properties list is its
  own component and hook (`tracker-properties.tsx`, `use-tracker-fields.ts`), and the Jira reads its own file.

## Settled (2026-11-13)

- Every property is listed, the empty ones folded; no setting to pick which ones.
- The agent is not given these values: not needed.
- A review's Notion and Jira tabs list them too, editable (step 5).
