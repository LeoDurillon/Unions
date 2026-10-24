# Plan: one set of specs per review

Status: built (2026-10-24, branch `review-specs`), steps 1 to 3; decisions confirmed by the user. Follows the
[UI/UX review](ui-review.md) step 3 item "one spec choice per review".

## Why

The review page's three agent actions each choose their specs on their own: **Review with agent** starts from the
last run's specs or the defaults (the PR description and its one linked Notion page, or the ticket's text),
**Explain** reuses the last agent review's, **Group by spec** asks for one source every time. The user picks the
same specs again and again, a ticket's review ignores the Notion page the ticket came from, and a pull request can
link only one Notion page while some implement several.

## Decisions (confirmed)

- **D1. A review has one list of specs**, kept on the review (a ticket's, or a pull request's under review), read by
  all three actions. A **Specs** bar under the review header shows them and edits them.
- **D2. What the list starts from** (the first time the review page asks for it): the ticket's text, or the PR's
  description; then every Notion page linked to it: a ticket's origin page, a pull request's linked pages.
- **D3. Linking a Notion page is adding a spec.** A pull request can link several pages (rare, but it happens: one
  PR closing two Notion tickets). Its Notion tab shows each page; **Link another page** adds one, **Unlink** removes
  one. Event rules that set Notion properties on a posted review set them on **every** linked page.
- **D4. Edits are saved on the review**, for everyone opening it and after a reload. A spec whose text was edited
  keeps the edited text; **Use the source** goes back to reading it fresh. A spec not edited is read from its source
  each time (Notion pages and PR descriptions change while a change is reviewed).
- **D5. Group by spec reads all the specs together**: one text, each spec a titled section, so its parts can come
  from several pages. The dialog only confirms the specs and starts.
- **D6. Stacks**: each pull request of a stack keeps its own list; the stack's agent review reads every member's
  specs, each linked to its pull request, a Notion page linked to several members once, linked to all of them (as
  the defaults do today).

## Data (`packages/core`)

`review_specs` (new table, migration):

| column                    |                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `id`                      |                                                                                         |
| `ticket_id` / `review_id` | the owner (one of them; cascade on delete)                                              |
| `kind`                    | `ticket`, `pr`, `issue`, `notion`, `text` (pasted text, no source)                      |
| `ref`                     | the Notion page id or the issue number; null for `ticket`, `pr`, `text`                 |
| `label`                   | as last read (`Notion: Seuil RFR`), for the bar without reading the source              |
| `url`                     | the Notion page's or issue's URL, as last read                                          |
| `text`                    | null: read from the source; set: the user's edited text (always set for `text`)         |
| `position`                | order in the list                                                                       |
| `removed`                 | the user removed a spec the list started with: kept so the defaults are not added again |

- The migration copies each `current_reviews.notion_page_id` (title, URL) into a `notion` row. The three columns
  stay unused until a second migration drops them (as the Notion integration move did).
- Pure helpers, tested: the starting list (D2), the stack's list (D6), the grouping text (D5).

## Web (`apps/web`)

- `routes/review-specs.ts` under a ticket and under a review (the owner from `GroupingTarget.owner`):
  - `GET /specs`: the list, starting it the first time (D2); each spec with its text (edited, or read now through
    `readSpec`) or the error reading it gave (a page no longer shared).
  - `PUT /specs`: the whole list as the bar saves it (order, removed, edited texts, added specs).
- `routes/review-notion.ts` on top of the rows: `GET /notion` lists the linked pages with their text (the tab),
  `PUT /notion` adds a page (and `stack: true` to the members with none), `DELETE /notion/:pageId` unlinks one.
- The current reviews list carries `notionPages: { id, title, url }[]` instead of the title and URL (the Notion
  marks in Under review and on stacks).
- `GroupingTarget.notionPageId` goes: the spec reads name their page.

## Worker

- `event-actions/notion.ts`: a posted review's pages are its `notion` rows; the delivery sets the properties on
  each (one request per page, retried together: setting a property twice is harmless).

## Client

- `components/review/specs-bar.tsx`: under the header, the specs as chips (`PR #1656 description`,
  `Notion: Seuil RFR`, an "edited" mark), **Edit** opens the specs dialog: the cards (`spec-cards.tsx`), Add a
  spec (`spec-picker.tsx`), remove, edit text, Use the source; Save writes `PUT /specs`.
- Review with agent: the scope (stack or one), the specs read from the bar's list (the stack's built per D6), an
  **Edit specs** link to the bar's dialog, Start. Its own editable cards go.
- Group by spec: the list as one text (D5), Start; no source picker.
- Explain: the list instead of the last run's.
- Notion tab: one section per linked page; Link another page, Unlink per page; the suggestions from the PR
  description add a page.
- `use-default-specs.ts` and the `ReviewNotionContext` go.

## Steps

1. Table, migration (copy), pure helpers and their tests; `GET`/`PUT /specs`; the Notion routes on the rows; the
   list's `notionPages`; the worker's rule over every page. Route tests with the fakes.
2. Client: the Specs bar and dialog; the three actions read the list; the Notion tab with several pages. Check in
   the browser with writes blocked; no agent run (it uses the user's Claude usage).
3. Second migration dropping `current_reviews.notion_page_id`, `notion_title`, `notion_url`; docs
   (`docs/spec/pull-requests.md`, `docs/architecture/web.md`, `integrations.md`, `database.md` if it lists tables).
