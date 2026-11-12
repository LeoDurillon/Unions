# UI overhaul: what is left

The client got a visual redesign, page by page, from mockups on Claude Design canvases (private to the owner;
ask them for access if you need them):

- Main page: https://claude.ai/artifact/NkaQa7J8PzNKo2ahQLhRqf
- The other top pages: https://claude.ai/artifact/3yNDgHrqdSn1MmAn8c55Hg
- Loading states: https://claude.ai/artifact/UJeoTdRMwaKwW6drcjkYBd
- Inner pages (settings card, ticket tabs, New ticket): https://claude.ai/artifact/7uJeymfhNcrU7SSfzvdwfJ

## Built

The ticket panel, board cards, main page, Investigations, Pull requests, Review (viewed files), Repository,
Environments, Usage, Settings frame (back arrow, Find a setting, General as cards), the running Previews page, the
prompt editors' Edit and Preview. Then the inner pages (2026-11-12):

- Every settings, Union settings and Environments page is a card: `.settings-cards` in `apps/web/client/index.css`
  (cards in the components layer, so a section's own classes still win; titles and the label column outside it).
  A one-line `Field` directly in a card gets its label in a column (`data-field` on `Field`).
- Ticket tab sections use `CARD_CLASS` (`components/ui/ui.tsx`): PR (pull request card, CI bar `ci-bar.tsx`,
  running checks folded past 4, the rewritten description as Preview / Edit / Changes), Preview (failure callout,
  output scrolled to its end), Log (a card per run, `steps/log-line.tsx`: tool chips, the agent's words as prose),
  Notion (page card, empty state, comment card), the review's Agents tab.
- The review header: why Send review is refused is on hover, so the title keeps its room.
- Dialogs: wider, rounder, a border and a blurred backdrop; New ticket has a footer bar.

Then the loading placeholders (2026-11-12): `components/ui/skeleton.tsx` (`Bone`, lines, rows, a list, a log, and
`Loading`, which adds "Reading … from GitHub" only for outside services). Used by the PR tab (CI checks,
description, discussion), the Overview's Files and Preview rows, the Log (`useLog` says when its first read came
back), Investigations (no count until read), Usage (tiles keep their labels), Event activity, Agent image, Memory,
Union Resources and Tools. Pages with their own words show them at once; only the data waits.

Then a card per settings group (2026-11-12): the settings frame and Environments show the page's name as its
title, and each page puts its one line under it with `SettingsIntro` (`components/settings/settings-intro.tsx`),
outside its cards. Checks (commands, iteration limit: two forms, two Save bars), Memory (lessons with the Save bar,
feedback), Agent image (status, image) and Rules (trackers' columns, rules) are split into cards.

Then the rest of the PR tab's board (2026-11-12): the pull request's card shows `#n · its title` (the web's
discussion read from GitHub now has `title`) with Unlink in its ⋯ menu; one branch card holds how far it is behind,
Rebase as its primary button and the other branch operations behind a menu button (`branch-status.tsx`,
`more-actions.tsx`; `lib/pull-request/rewrite-block.ts` says when the branch can be rewritten); the discussion's
notes are rows with an initials avatar (`note-avatar.tsx`) and Add to review beside them.

Then the Preview tab's board (2026-11-12), client only: a red failure card with Start again above the preview's card
(`preview-failure.tsx`); the card (`preview-card.tsx`) lists the settings' exposed services, one row each with the
preview's state, the port and, while it runs, the address (`preview-services.tsx`); the e2e tests are a card whose
line says why they cannot run (`e2eRefusal`); scripts are ▸ chips. Union records the preview's state, not each
service's: per-service state (db Ready, simulator No answer) would need the worker to store each container's state
(a migration); the user chose not to for now.

Then the Log's board (2026-11-12), client only: a tool call keeps its id and whole input, its result its id and
text (`lib/log/agent-events.ts`), and `lib/log/log-calls.ts` folds each result into its call; each call is a row
(`steps/log-tool-row.tsx`) with its result's first line and its time, opening to the input and result; the agent's
words are rows; a run's card (`steps/log-run.tsx`) says when, its tool calls, model and use, and pulses until its
`run_finished`; Steps / Raw output switches to every CLI line (`steps/log-raw.tsx`). Not built: Stop (no action
stops one step without cancelling the ticket: a state machine and worker change) and "turn N of M".

Then the Notion tab's page card (2026-11-12): core's page read keeps `editedAt` (`last_edited_time`) and `status`
(the page's property of Notion's `status` type, its name and value; `integrations/notion-page-parse.ts`); the web's
`GET /api/tickets/:id/notion-comments` reads the page beside the discussions (`page`, null when Notion refuses it);
`components/notion/notion-page-card.tsx` shows them. Not built: "Bring the page's changes in" and "Draft with the
agent" (new features).
On the user's database the status reads null: its status column (`Avancement`) is not of Notion's `status` type
(a select, most likely). Naming the status column in Settings → Notion would fix it; the user has not decided yet.

Then the New ticket dialog (2026-11-12), client only: the title without a label; the description in one box
(`new-ticket/description-field.tsx`) with Write / Preview, "Markdown · drop files here", Attach files, and the files
dropped or attached as chips under the text (`pending-file-chips.tsx`), a chip opening its note and switch; Flow and
Depends on as rows with their label in a column (`form-row.tsx`), the flow's description and steps in one line under
the switch (`FlowPicker`, also in the Overview's Flow row); Cancel beside Create ticket, which shows Ctrl ↵ (⌘ ↵ on
a Mac): Ctrl/⌘+Enter in the title or the description submits (`form-footer.tsx`). Not built: "Start it now".

## Left to do

Take them in this order; each is one worktree, one commit, checked with screenshots before it is deployed.

1. **Pages not redesigned yet**: a step's output tab (`components/steps/step-tab.tsx` and its notices), the
   review's Ticket and Report tabs beyond their cards, Union Tools and Connectors lists, the GitHub App page (its
   header sits outside its card), the onboarding wizard, the setup agent's proposal cards, the guide.
2. **Dark mode pass** over every page above. Checked in dark so far: the loading PR tab, Settings › Checks, the PR
   tab, the Preview tab (failed), the Log and the Notion tab. Not yet: the other settings, Union settings and
   Environments pages, Overview, Investigations, Usage, Pull requests, Repository, the review page, dialogs
   (New ticket is checked).

Two ideas on the inner canvas are new features, not design: "Draft with the agent" on a Notion comment and "Start
it now" in New ticket. Ask the user before building either: both spend Claude usage or start work.

## How the work was done

- A worktree per step (`git worktree add -b <branch> ../union-next-<name> main`, then `bun install`).
- A temporary `apps/web/vite.uicheck.config.ts` serving the worktree's client on 5174 with `/api` proxied to the
  live instance on 5173, and throwaway Playwright scripts on `scripts/ui-check/browser.ts` (`openApp` blocks every
  write) taking screenshots to the scratchpad. Delete both before committing.
- `bun run check`, then commit with the hook, `bun run active`, `git merge --ff-only` into the live checkout. Only
  client files changed: no restart needed. Update the user guide page that covers what changed.
