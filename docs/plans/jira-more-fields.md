# More Jira fields in rules

Status: built (branch `jira-more-fields`, 2026-11-07), steps 1 to 4 but the real check. Follows [Jira rule actions](jira-rule-actions.md), built (text, multi-line text,
number, date, date and time, single select, labels).

## Why

**Set fields of the ticket's Jira issue** leaves out the fields teams most often want a rule to set: the assignee
("PR opened → assign the reviewer"), a multi-select or checkbox ("Platforms: Web, iOS"), the Fix version ("merged →
2.4"), components and the sprint. Notion rules can set people (from the workspace's members), multi-selects and
checkboxes; Jira's should reach the same.

## What the user gets

In a Jira fields rule, these fields can be picked, each with a value input that fits it:

- **A user field** (Assignee, or a custom user picker): a person picked from the project's assignable users,
  or empty to clear it. No variables: a user is picked, as Notion's people.
- **A multi-select or checkboxes**: options picked from a list, set as a whole.
- **Fix versions, Affects versions**: versions of the project picked from a list (released or not).
- **Components**: components of the project picked from a list.
- **Sprint**: the active sprint, the next one, or one picked from the project's board.

## Decisions

- **D1. Lists read when the editor opens, ids stored with names.** Users (`GET /rest/api/3/user/assignable/search
  ?project=KEY`), versions (`GET /project/{key}/versions`), components (`GET /project/{key}/components`) and
  sprints (the project's board from `GET /rest/agile/1.0/board?projectKeyOrId=KEY`, then its active and future
  sprints) are read by the web for the editor (reads only), not stored with the fields: they change too often. A
  rule stores the picked ids with their names, so its sentence reads without Jira and a removed one fails the
  delivery naming it.
- **D2. Field types from the schema, as now.** `jira-field-types.ts` gains `user` (`schema.type: 'user'`),
  `multi_option` (`array` of `option`, which also covers checkboxes), `versions` (`array` of `version`),
  `components` (`array` of `component`) and `sprint` (the custom type `com.pyxis.greenhopper.jira:gh-sprint`).
  The system fields allowed become `duedate`, `labels`, `environment`, `assignee`, `fixVersions`, `versions`,
  `components`.
- **D3. Values as Jira takes them.** A user `{ accountId }` (null clears); options `[{ value }]`; versions and
  components `[{ id }]`; a sprint its id as a number. "The active sprint" and "the next sprint" are resolved when
  the rule runs (the board's sprints then), so a rule keeps working from sprint to sprint.
- **D4. Set, not add, except labels.** Multi-selects, versions and components are replaced by the rule's value, as
  Jira's `fields` does; adding to them (as labels are added) is a later choice per field, if asked for.

## Steps

1. **Types and values.** D2's types, `jira-values.ts`'s shapes for them (D3), checks at save; tests per type.
2. **Lists for the editor.** `JiraApi`'s reads and the web routes (`/jira/users`, `/jira/versions`,
   `/jira/components`, `/jira/sprints`), with their fakes; route tests.
3. **The editor.** `jira-field-row.tsx`'s inputs per type (a user picker like `people-field.tsx`, multi-pickers,
   the sprint choice); the rule sentence; UI check.
4. **The worker.** The active and next sprint resolved at delivery (D3), the delivery's text; worker tests. Real
   check on the user's site after asking (it writes to their Jira), then `documentation/automation.md` and this
   plan's status.

Built: `jira-field-types.ts` gains the five types (D2) and `picks` on a field's value (`value` holds their names,
for the sentence and preview). A multi-select is typed as option names rather than picked, as a single select is:
Jira gives a field's options only on an issue's edit screen or to admins, and the edit screen checks them when the
rule runs. `jira-values.ts`'s `jiraPickedValue` (D3), `jira-picks.ts` (the lists over one new `JiraApi.read`, and
`resolveSprint`), `routes/jira-picks.ts`, the worker's `jira-field-picks.ts`. Client: `jira-pick-field.tsx` (a
select for a person or a sprint, boxes for versions and components; a pick no longer listed stays so it can be
removed), `use-jira-picks.ts`. Tests: field types, values, `jira-picks.test.ts`, the save checks,
`jira-field-picks.test.ts` (worker), `jira-pick-routes.test.ts`. UI check on a scratch database with Jira's lists stubbed: each picker, the preview, the save (checked by the server) and the rule's sentence. Checked on the user's site after deploying (the lists only, read): a team-managed project's board is of type "simple", not "scrum", and has sprints, so a board with sprints is the first scrum board, else the first simple one.

## Risks

- **Sprints need Jira Software and a board.** A project without one has no sprint field to offer; the picker says
  so.
- **Assignable users are per project and permission.** A user who cannot be assigned is not listed; a rule naming
  one who lost the permission fails with Jira's message.
