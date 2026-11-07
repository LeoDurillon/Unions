# Jira rule actions

Status: planned (2026-11-07); steps 1 and 2 built (branch `jira-rules`, 2026-11-07). Follows [Jira](jira.md) (built: connection and import, reads only). Scope: event
rules that move a Jira issue to a status, set its fields, and comment on it, for tickets imported from Jira.

## Why

A project connected to Jira imports its issues, but nothing goes back: when the ticket's pull request opens or
merges, someone moves the issue on the Jira board by hand. Notion already gets this from event rules ("Set
properties of the ticket's Notion page"); Jira should too: PR opened → issue to **In Review**, PR merged → **Done**
with the PR link in a field, a comment with the link for the people who follow the issue in Jira.

## What the user gets

In **Settings → Events → Rules**, three more actions, offered when the project is connected to Jira:

- **Move the ticket's Jira issue**: pick a status of the Jira project (To Do, In Review, Done…).
- **Set fields of the ticket's Jira issue**: pick fields and their values (text with variables like `{pr.url}`, a
  number, a date, a select's option, labels to add).
- **Comment on the ticket's Jira issue**: a text with variables.

The rule's sentence, its preview on a ticket and its deliveries (Activity) work as for the other actions. A
ticket not imported from Jira is skipped ("The ticket was not imported from Jira"), as Notion's are.

## What does not change

- The trigger catalog, the delivery queue and its retries, the template variables, the Activity list.
- GitHub stays the source of truth: the board status is the GitHub Project's; Jira follows only through rules.
  Union never reads Jira's status back.
- Reads from the web, writes from the worker; the token never reaches the browser.

## Decisions

- **D1. The issue is the ticket's origin.** `origin_kind = 'jira'`, `origin_id` the key. Tickets written in Union
  or imported from GitHub have none: skipped. Linking an existing ticket to a Jira issue afterwards (as
  [Notion's link](../../documentation/tickets.md#link-a-ticket-to-its-notion-page)) is a later plan.
- **D2. One action kind per thing it does**, as Events v2 decided: `jira_transition`, `jira_field`,
  `jira_comment`. A status move and a field edit are different Jira calls with different failures; a rule that
  needs both is two rules on the same trigger.
- **D3. A transition targets a status, not a transition.** Transitions belong to a workflow and an issue's
  current status, so the rule stores the target status (`{ statusId, statusName }`, from the statuses already read
  into `integrations.fields`). At delivery: `GET /issue/{key}/transitions`, the one whose `to.id` is the status,
  then `POST /issue/{key}/transitions`. Already in that status: succeeded, "already In Review". No transition
  from the current status: failed, "No transition from To Do to Done in its workflow". A transition screen with
  required fields answers 400: failed with Jira's message (Union does not fill transition screens).
- **D4. Fields from `GET /rest/api/3/field`, values checked at delivery against the issue's `editmeta`.** The
  editor needs names and types; the allowed options depend on the issue's type and screen, so they are read when
  the action runs (`GET /issue/{key}/editmeta`), not stored. A rule stores
  `{ fieldId, fieldName, fieldType, value }` as GitHub Project fields do (`event-project-fields-action.ts`), so its
  sentence reads even if the field is renamed or gone. Supported types, read from `schema`:

  | Type                                     | Value in the rule                         | Sent                            |
  | ---------------------------------------- | ----------------------------------------- | ------------------------------- |
  | `string` (single-line text, URL)         | a template                                | the text                        |
  | `string`, custom `textarea` (multi-line) | a template                                | the text as ADF paragraphs      |
  | `number`                                 | a number or a template                    | a number                        |
  | `date`, `datetime`                       | `YYYY-MM-DD` / ISO, or `{date.today}`…    | as is                           |
  | `option` (single select)                 | an option's name (no variables)           | `{ value: name }`               |
  | `array` of `string` (labels)             | labels to add, comma-separated, templates | `update: { labels: [{ add }] }` |

  Users, versions, components, sprints and multi-selects are left out of v1: they need ids Union would have to
  list and keep. `summary` and `description` are left out too: the ticket's text is Union's, the issue's is the
  team's. The field list is stored with the project's statuses (`integrations.fields`, read by **Refresh**).

- **D5. Text to ADF, minimal.** Comments and multi-line fields need ADF in REST v3. A pure `text-adf.ts`
  (core): paragraphs from blank lines, line breaks, and bare `https://` URLs as links. No markdown parsing: rule
  texts are short and written for Jira's readers.
- **D6. Pace and failures.** One target per kind in the worker (`event-actions/jira-*.ts`), `perTick` 2 (Jira
  Cloud limits per user, and a transition is two calls). Retry on 429 (after `Retry-After`), 5xx and network
  errors; fail on other 4xx with Jira's message. 403 names what the account lacks: "Transition issues", "Edit
  issues" or "Add comments" in the Jira project.
- **D7. Writes only from the worker.** `JiraApi` gains `transitions`, `transitionIssue`, `editMeta`,
  `updateIssue`, `addComment`; the web calls none of the writes (ast-grep `web-reads-trackers-only` extended, with
  cases). The web reads the field list through the existing `POST …/integrations/jira/fields` refresh.
- **D8. Previews do not call Jira.** The rule preview says what it would do on that ticket ("Would move ABC-12
  to In Review", "Would set Fix link to https://…"), with "Checked against Jira when it runs" for transitions and
  options.

## Design

### Core

- `event-actions.ts`: three kinds in `ActionFields`, `ACTION_KINDS`, `ACTION_LABELS`, `EMPTY_ACTIONS`;
  `event-jira-action.ts` for their types and checks (a new file: `event-actions.ts` is at 156 lines, and
  the Jira checks need the stored fields, as `event-notion-action.ts` needs Notion's columns). `ACTION_CHECKS`
  in `event-rules.ts` gets the three.
- `integrations/jira-integration.ts`: `jiraFieldsOf(row)` (the guard the import plan left out until something read
  the stored fields), and `JiraFields` gains `fields: JiraFieldInfo[]`. `jira-provider.ts`'s `readFields` also
  reads `GET /field` and keeps the supported types (D4).
- `integrations/jira-values.ts`: a rendered value to what Jira takes, per type, and why it cannot be one (pure,
  tested; the counterpart of `notionPropertyValue`).
- `integrations/text-adf.ts` (D5), tested.
- `jira-api.ts`: the five calls of D7 in `FetchJiraApi`; 204 answers read as no body.

### Worker

- `event-actions/jira-transition.ts`, `jira-field.ts`, `jira-comment.ts`: each finds the ticket's issue (D1),
  renders the templates with `templateValues`, makes its calls, and returns a `DeliveryOutcome` (D3, D6). Shared
  lookup and failure mapping in `event-actions/jira-target.ts`, so each file stays small.
- `event-dispatcher.ts`: the three targets in `ActionTargets` (the type checker asks for them), with the
  worker's `FetchJiraApi`.

### Web and client

- `rule-previews.ts`: one preview per kind (D8).
- `routes/event-rules.ts`: the rules list also returns the stored Jira fields and statuses (as it returns
  `notion`), so the editor and the sentences have them.
- Client, under `components/integrations/jira/`: `jira-transition-fields.tsx` (a status select),
  `jira-field-fields.tsx` (a row per field: field select, value input by type, as `project-fields-fields.tsx`),
  `jira-comment-fields.tsx` (a textarea with the variables list). `action-fields.tsx` and `rule-action-text.tsx`
  dispatch to them; both are near their import limit, so the per-kind components go behind one
  `integrations/jira/jira-action.tsx` entry (fields and sentence).
- `events-section.tsx`: "Jira fields of “Apollo”, read …" with **Refresh from Jira**, beside Notion's.

## Steps

Each step ships on its own; `bun run check` after each.

1. **Core: kinds, checks, fields read.** The three kinds and their checks, `jiraFieldsOf`, `readFields` with
   `GET /field`, `jira-values.ts`, `text-adf.ts`. Tests: each type's values and errors, unknown variables, a field
   gone from the stored list, ADF of paragraphs, breaks and links. No worker or UI yet: the settings route refuses
   to save the new kinds until step 3 (the editor cannot build them).
   Built, with one change of order: the three kinds are not in `ActionFields` yet. Registering a kind makes the
   type checker ask for its worker target, preview and editor entries, so step 1 adds the actions' types and checks
   on their own (`event-jira-action.ts`: `checkedJiraTransition`, `checkedJiraFields`, `checkedJiraComment`, each
   throwing `EventRuleError` like Notion's), and step 2 registers them with their targets; `ACTION_KINDS` (what the
   editor offers and the save accepts) gets them in step 3. The field types are `integrations/jira-field-types.ts`
   (browser-safe, for the step 3 editor): `text`, `textarea` (custom textareas and the system `environment`, which
   are rich text), `number`, `date`, `datetime`, `option`, `labels` (the system field and custom label fields).
   `GET /field` is read by `readFields` with the project and its statuses (`fieldsOf`, sorted by name); fields read
   before this have none, so a field action asks for a Refresh while a move still works on the stored statuses.
   `jira-integration.ts` holds `JiraFields` and `jiraFieldsFor(db, projectId)`. Values: `jira-values.ts`
   (`jiraFieldValue`, `jiraValueError`; an empty value clears the field, a datetime is sent as
   `…T10:00:00.000+0000`). Comments are refused above 32 767 characters, Jira's limit.
2. **Worker: the targets.** The `JiraApi` writes and their fake, the three targets, the dispatcher. Tests with the
   fake, as `event-dispatcher.test.ts` does for Notion: a ticket without a Jira origin skipped, a transition found,
   already there, missing, refused with 400; fields sent per type, an option not allowed by `editmeta`; a comment's
   ADF; 429 and 5xx retried, 403 failed naming the permission. ast-grep rule extended.
   Built: the kinds are in `ActionFields` (labels, empty actions, `ACTION_CHECKS`), still not in `ACTION_KINDS`, so
   nothing offers or saves them until step 3; the action types are `ActionOf<'jira_…'>` and `JiraFieldValue`
   moved to the browser-safe `jira-field-types.ts` (`event-actions.ts` importing `event-jira-action.ts` made a
   cycle through `event-notion-action.ts`). `JiraApi`: `issueStatus`, `transitions`, `transitionIssue`,
   `editMeta` (a select's option names), `updateIssue`, `addComment`; writes send JSON and read 204 as done. A
   move reads the issue's status first, so an issue already there gets no transition (it would only add history).
   Worker: `event-actions/jira-target.ts` (the ticket's issue, credentials, variables; failures: not a
   `JiraError`, 429 and 5xx retried with the queue's own backoff, not `Retry-After`; 403 names the permission),
   `jira-transition.ts`, `jira-field.ts` (fills and shapes every value first, then checks them all against
   `editmeta`, then one `PUT`), `jira-comment.ts`, and `jira.ts` (`jiraTargets`, `perTick` 2). `EventDispatcher`
   takes a `JiraApi` (default `FetchJiraApi`). The web's previews answer "not available yet" and the editor shows
   no fields for these kinds, both replaced in step 3; the rule sentences are done (`jira-action-text.tsx`).
   ast-grep `web-reads-trackers-only` now refuses `transitionIssue`, `updateIssue` and a tracker client's
   `addComment` in the web. `docs/architecture/integrations.md` still says Union writes nothing to Jira: true
   until step 3 offers the actions; updated then.
3. **Settings: editor, sentences, previews.** The components, the route's Jira fields, the previews. UI check
   (`scripts/ui-check/`, rules saved blocked): add each kind, its sentence, the preview on a Jira ticket.
4. **Real check and docs.** Ask the user first (it writes to their Jira): one rule of each kind on a test issue
   (SCRUM-1), triggered by a PR opened on its ticket; check the issue in Jira and the Activity list. Then
   `documentation/automation.md` (the three actions, what the account needs), `docs/architecture/integrations.md`
   (Jira writes from the worker), AGENTS.md's rules (Jira writes in the worker, as Notion's), this plan's status
   and `docs/plans/README.md`.

## Risks

- **Workflows differ per issue type.** A status reachable from one type's workflow may not be from another's:
  D3 fails the delivery with which transition is missing, rather than guessing a path through several.
- **Required fields on transition screens.** Common for Done ("Resolution"). Failing with Jira's message is
  honest but may surprise; if it happens on the real site, a later step can let a transition carry a resolution.
- **Classic token, the user's permissions.** Rules act as the person who made the token; Jira shows the changes
  under their name. A bot account is the user's choice (another email and token).
- **The field list grows stale.** A field added in Jira needs **Refresh from Jira**, as Notion's columns do; a
  field removed fails the delivery naming it.

## Later

- Link an existing ticket to a Jira issue (D1), so tickets written in Union get rules too.
- Users (assignee), versions (Fix version), components and sprints as field values.
- Transition screens with fields (D3).
