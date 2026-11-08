# Link a ticket to a Jira issue afterwards

Status: built and deployed (2026-11-07), steps 1 to 3; checked by the user on their instance. Follows [Jira](jira.md). The Jira counterpart of the Overview's **Link a Notion page**
(`routes/ticket-notion-link.ts`, `ticket-notion-row.tsx`).

## Why

A ticket gets a Jira issue only when it is imported from it, or created from an investigation with **Also create it
in Jira**. A ticket written in Union, or imported from a GitHub issue, never has one: its Jira tab stays off, Jira
rules skip it ("The ticket was not imported from Jira"), and a team that tracks the work in Jira links the two by
hand in each. Notion tickets have **Link a Notion page** in the Overview for this; Jira tickets should have the same.

## What the user gets

- In the Overview, for a project connected to Jira and a ticket from no tracker, the **Jira** row offers **Link a
  Jira issue**: paste a key or link, **Check** shows the issue's summary, **Link** links it. The ticket then has the
  Jira tab, the comments count, and the Jira rules apply to it.
- A linked ticket's row has **Change** and **Unlink**. Unlinking leaves the issue in Jira as it is.
- The ticket's text does not change: linking is not importing.

## Decisions

- **D1. One origin.** A ticket comes from one tracker (`origin_kind`). **Link a Jira issue** shows only for a ticket
  with no origin; a ticket from Notion keeps its Notion row, and to move it to Jira the user unlinks the page first.
- **D2. The issue must be of the project's Jira project.** As the import: `item()` refuses another project's issue
  (`ItemOutsideSourceError`, 409), and a link on another site is refused (`refError`). The check reads the issue
  through the provider, so it is also the proof the account can see it.
- **D3. Routes as Notion's.** `POST /api/tickets/:id/jira/check` (`{ ref }` → `{ key, title, url }`), `PUT
  /api/tickets/:id/jira` (links: `setTicketOrigin` with kind `jira`), `DELETE /api/tickets/:id/jira` (unlinks, only
  a Jira origin). The web writes only Union's database: nothing goes to Jira.
- **D4. The row is generic where it can be.** `ticket-notion-row.tsx`'s link form (`notion-link-form.tsx`) takes a
  check, a link and the item's label; it becomes `tracker-link-form.tsx`, used by both rows.

## Steps

1. **Routes.** `routes/ticket-jira-link.ts` (D2, D3), tests: link, a foreign project's issue refused, another site
   refused, unlink, a Notion ticket refused (D1).
2. **Overview.** The Jira row's Link, Change and Unlink; the link form shared with Notion's (D4). UI check
   (`scripts/ui-check/`): link, change, unlink, the Jira tab enabled after linking.
3. **Docs.** `documentation/tickets.md` (the Overview's Jira row), `docs/spec/flow.md`, this plan's status.

Built: `routes/ticket-jira-link.ts` (the check reads the issue through `jiraProvider(…).item`, now exported by
core), `ticket-origin-guard.ts` (`requireFreeOrigin`, `requireOrigin`). Found on the way: Notion's link replaced
any origin and its unlink cleared any, so on a project connected to both trackers a Jira ticket could lose its
issue; both trackers' routes now refuse with 409 (D1 on both sides), and the Notion row hides Link a Notion page
on a ticket from Jira. Client: `tracker-link-form.tsx` (Notion's form generalized; `NotionLinkForm` is a wrapper,
so its two callers are unchanged), `use-ticket-jira.ts`, `ticket-jira-row.tsx` (Link, Change, Unlink; linking
forgets the Jira tab's cached comments). Route tests in `jira-ticket-link-routes.test.ts`. UI check on a scratch
database, Jira's calls stubbed: the rows of a ticket written in Union (both links), from Jira (Change, Unlink, no
Notion link), from Notion (no Jira link), and the check, link and unlink requests.

## Later

- Moving a ticket from one tracker to the other in one step (D1).
