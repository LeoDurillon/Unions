# Plan: getting started, the help menu and the guide in the app

Status: steps 1 to 3 built (2026-11-07, branch `onboarding-help`), checked in headless Chromium against the live
data (step 1 with no ticket and no check command stubbed; step 3 with the worktree's API serving the guide; no
write tried). Settings pages' Learn more links built after (2026-11-07). Left: step 4.

## Idea

After the setup wizard, a new user lands on five empty columns ("No ticket waiting", "Nothing running"...) with
nothing saying what to do first. The board explains how to start a ticket only once one can start. The user guide
(`documentation/`) answers most questions, but nothing in the app links to it.

Three pieces, cheapest and most useful first; the tour last, once the first three show what is still unclear.

## Step 1: a getting-started checklist on the board

A card above the board's columns, per project, whose items tick themselves from what the project's tickets and
settings already say (no new table, no event):

| Item                                | Done when                                          | Click                       |
| ----------------------------------- | -------------------------------------------------- | --------------------------- |
| Set the checks the agents must pass | `config.gateCommand` is set                        | Settings → Checks           |
| Write your first ticket             | the project has a ticket                           | New ticket                  |
| Start it                            | a ticket left Backlog                              | (says: Start, or drag)      |
| Answer the planning steps           | a ticket reached In review or later                | (says: Needs you, `n`)      |
| Review the change and merge its PR  | a ticket's pull request was merged (or it is Done) | (says: Review changes, `r`) |

- The state is a pure function, `gettingStarted(tickets, config)` in `client/lib/getting-started.ts`, with tests.
- The card shows while an item is left and the user has not hidden it. **Hide** is remembered per project in this
  browser (`localStorage`, `union.getting-started.hidden.<projectId>`), guarded like `use-folded-columns.ts`.
  A local, mostly single-user app: no need for a database setting.
- Every item has a line saying what happens and a **Learn more** link to the guide's heading on it (step 3).
- Hidden behind the first-run wizard (`BoardView` without `onStart`): the card belongs to `Board`.
- Guide: `documentation/first-project.md` ("The board opens" → the checklist) and `tickets.md`.

## Step 2: a help menu in the sidebar

Built. A **Help** entry under Union settings in the sidebar (a `?` on the rail), opening a short menu above it:

- **Getting started**: goes to the open project's board (the Board tab) and shows its checklist, even complete
  (clears its Hide). Disabled before there is a project.
- **User guide**: the guide's index, in the app (step 3).
- **Keyboard shortcuts (?)**: the list `?` opens.
- (Step 4) **Take the tour**.

The menu asks through window events (`lib/help-requests.ts`); the checklist, the project view
(`lib/use-project-view.ts`, out of `workspace.tsx`) and `shortcuts-help.tsx` listen.

## Step 3: the user guide in the app

Built, as below. Every page of both settings areas has Learn more under its name (`lib/settings-guide.ts`; a
test fails when a target heading disappears from the guide). Links into `docs/` and `AGENTS.md` open
`LeoDurillon/Unions` on GitHub (`REPO_URL` in `lib/guide-links.ts`). Headings get GitHub's ids
(`lib/heading-slug.ts`); every `#heading` link of the guide resolves (checked over all pages). Two headings with
the same text on one page would share an id; none does today.

- The web server serves the pages of `documentation/` read-only (`GET /api/guide/:page`, names from a fixed
  list read at start, never a path from the request) and the screenshots they show.
- A Guide page (`?guide=<page>`) renders them with the app's `Markdown`, links between pages staying in the app,
  links into `docs/` going to GitHub.
- "Learn more" links from the settings pages and the checklist go to the right page and heading.
- The guide then matches the version that runs, and works for a private repository.

## Step 4 (later): an app tour

Offered at the end of the wizard and from the help menu, never forced; about six stops (New ticket, the columns,
Needs you, the ticket panel, the project tabs, the sidebar's settings and usage). Decide after steps 1 to 3:

- An empty board gives a tour nothing to point at: run it once a ticket exists, or show a placeholder card only
  during the tour. Never start a real ticket for it (Claude usage).
- Library: driver.js (small, no React binding), in the `ui` catalog; or a hand-made popover over
  `data-tour` attributes.
- Tours break silently when the UI moves: a UI check (`scripts/ui-check/`) walks it.
