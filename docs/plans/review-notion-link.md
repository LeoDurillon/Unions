# Link a pull request under review to its Notion page

Status: built (2026-10-19, branch `review-notion-link`), steps 1 to 3. D6 (Notion comments in the tab) waits on
the Notion comments plan. "Link the whole stack" is offered from any member, not only the bottom one. Decisions D1 to D6
confirmed (D6 left out).

## Why

A pull request reviewed without a ticket (Current reviews) often implements a spec that lives in Notion. Today the
reviewer opens Notion beside Union to read it, and pastes its URL again each time they **Group by spec** or
**Review with agent**. A ticket imported from Notion already has its page: its description shows on Overview and
its text is a spec source without any URL. A review should get the same once it is linked to its page.

## Design in short

- **Link**: the review's **Description** tab gets a **Notion page** row: "Link a Notion page" (a URL field, read
  through the project's integration, its title shown before saving), or, once linked, the page's title (a link to
  Notion), **Change** and **Unlink**. Notion URLs found in the PR description are offered as one-click
  suggestions ("Link _Export to CSV_?"), never linked on their own.
- **Notion tab**: once linked, a **Notion** section tab appears after **Description**, before **Comments**: the
  page's title, a link to Notion, and its text cleaned as the ticket's description is (`notionMarkdown`, mention
  titles resolved), folded when long like `TicketDescription`. Read from Notion once per opening, with
  **Refresh**.
- **Specs without re-import**: in **Group by spec** and **Review with agent**, the **Notion page** source reads the
  linked page at once (no URL to paste); "Another page" still takes a URL. The linked page is part of the default
  specs (D4).

Nothing is written to Notion or GitHub: the link is a plain record of the review, which the web writes itself.

## Decisions (proposed)

- **D1. What is stored.** `current_reviews` gets `notion_page_id`, `notion_title` and `notion_url` (a snapshot for
  the tab label and the link, so the page renders without calling Notion). The page's **text is not stored**: the
  tab and the spec sources read it fresh, since the spec can change while the PR is reviewed (a ticket keeps a
  snapshot because its agents need a fixed text; a review has no pipeline). Images then come with fresh Notion
  links on each read, so no download is needed (they expire within the hour, the tab's Refresh renews them).
- **D2. Which pages.** Any page the project's integration can read, not only rows of its data source, as the
  Notion spec source already allows: specs often live in a parent page. One page per review.
- **D3. Stacks.** Each pull request of a stack has its own link (they are separate `current_reviews` rows and may
  implement different parts). When the user links the bottom one and the others have none, the row offers "Link
  the whole stack to this page", which sets it on every member without a link.
- **D4. Default specs.**
  - Group by spec: the linked page becomes the **default source** (selected and read when the dialog opens),
    before the PR description: a linked page is the user saying "this is the spec".
  - Review with agent (one PR): the PR description **and** the linked page, two cards; the user deletes one if
    unwanted. Stack: each member's description and each member's page, linked to that PR (`prs: [number]`); a page
    linked to several members appears once, linked to all of them.
  - A last run's specs still win over the defaults, as today.
- **D5. Tickets too.** A ticket with a `notionPageId` gets the same shortcut in the spec picker: the Notion page
  source reads its page at once (current text, not the import snapshot, which the "Ticket description" source
  already gives). Cheap, same code path; no link UI for tickets (their page is set at import).
- **D6. Notion comments.** The [Notion comments](notion-comments.md) plan adds a Notion tab on tickets. Once both are
  built, the review's Notion tab shows the page's discussions under the text, read only at first ("Add to review"
  later, as a general draft of the current review). Not part of this plan's steps.

## Core (`packages/core`)

- `schema-reviews.ts`: the three columns on `currentReviews`, nullable; migration with
  `cd packages/core && bunx drizzle-kit generate`. `CurrentReview` (web `api-types.ts`) carries them to the
  client with no further change.
- `notion-links.ts` (new, pure, browser-safe): `notionUrlsIn(markdown)`: the Notion page URLs a text holds
  (`notion.so`, `notion.site`, with `parseNotionId`), deduped, for the suggestions. Tests next to it.

## Web (`apps/web`)

- `routes/review-notion.ts` (new), mounted at `/:number/notion` in `current-reviews.ts` (10 imports already: mount
  it from `review-workspace.ts`, 4 imports, instead):
  - `GET`: the linked page's text: `{ title, url, markdown, truncated }`, read with `notion.page` and
    `notion.pageMarkdown`, cleaned with `notionMarkdown` and the mention titles. Move `mentionTitles` out of
    `routes/notion.ts` into a shared `notion-mentions.ts` so the import and this route use one. 404 with "No
    Notion page linked" when none; the `notion.ts` `guarded` messages for 401/404 (unshared page).
  - `PUT`: `{ page }` (URL or id, `requireNotionId`); reads the page to check the integration sees it, stores id,
    title and URL. `{ page, stack: true }` also sets it on the stack's members without a link (D3).
  - `DELETE`: clears the three columns.
  - `GET /suggestions`: the Notion URLs of the PR description (`getDiscussion`, `notionUrlsIn`), each with its
    title when readable; unreadable ones are left out.
- `routes/review-groupings.ts`: `GroupingTarget` gets `notionPageId: string | null` (the review's link, or the
  ticket's page for D5), set in `grouping-targets.ts`.
- `routes/spec-sources.ts`: `notionSpec` uses `target.notionPageId` when `ref` is empty; empty `ref` and no link
  stays a 400 ("Give a Notion page URL or ID"). Its label stays `Notion: <title>`.
- Tests: the route with the fake `NotionApi` (link, unshared page refused, unlink, stack link), `readSpec` with an
  empty ref and a link.

## Client (`apps/web/client`)

- `components/pull-requests/review-notion-link.tsx` (new): the row in the Description tab: link field with the
  page title previewed, suggestions, Change / Unlink, "Link the whole stack". `lib/use-review-notion.ts` (new):
  the queries (page text, suggestions) and mutations; invalidates the current reviews list on change.
- `components/pull-requests/review-notion-tab.tsx` (new): the tab body. Extract the folding of
  `ticket-description.tsx` into a small `folded-markdown.tsx` used by both, rather than copying it.
- `pr-review-sections.tsx`: `prReviewSections(target, review)` adds the Notion section when
  `review.notionPageId` is set; `stack-review.tsx` passes `review`. Switching PR in a stack already remounts the
  page (`key`), so a member without a link shows no tab.
- `spec-picker.tsx`: `specSources` takes the link; for `notion` with a link, `SpecLoader` reads at once like
  `pr`/`ticket` and shows "Another page" to type a URL. `group-by-spec-dialog.tsx`: starts on `notion` and loads
  it when linked (D4).
- `lib/use-default-specs.ts`: adds the linked page's spec (one PR) and each member's (stack, D4). It reads the
  page through the same `/groupings/source` route (`kind: 'notion'`, empty ref), so nothing new on the server.
- Current reviews list (`review-stack-item.tsx` and the single row): a small "Notion" mark when linked.

## Steps

1. Columns and migration, `review-notion.ts` (`GET`, `PUT`, `DELETE`), the link row and the Notion tab. Check
   against a real review with a page of the project's workspace (read only).
2. Spec sources: `notionPageId` on `GroupingTarget`, the empty-ref read, the picker and the defaults (D4), D5 for
   tickets. Check by opening the dialogs (no agent run: starting one uses the user's Claude usage, ask first).
3. Suggestions from the PR description, stack linking (D3), the mark in the list.

## Docs to update when built

- `docs/spec/pull-requests.md`: the link, the Notion tab, the default specs.
- `docs/architecture/integrations.md`: one more Notion read in the web (the review's page).
- `docs/architecture/web.md`: the route.
- This plan's status and `docs/plans/README.md`.
