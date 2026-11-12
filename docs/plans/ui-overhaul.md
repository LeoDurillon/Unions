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

## Left to do

Take them in this order; each is one worktree, one commit, checked with screenshots before it is deployed.

1. **Ticket PR tab, the rest of the board "Ticket panel · PR tab"**:
   - the pull request's own title in its card (the ticket summary has no PR title: the web has to read it, or
     the worker store it);
   - the behind-the-base card with Rebase as its primary button and More actions as a menu beside it, instead of
     a separate fold;
   - the discussion's All / People / Bots filter with counts, and its comments as rows with an avatar.
2. **Preview tab** (board "Ticket panel · Preview tab"): one row per service with its state and port (check what
   the preview's view holds before adding an API field), scripts as chips with ▸, the e2e tests greyed out until a
   preview runs, the failure card with Start again beside the reason.
3. **Log** (board "Steps › Log"): a header with the step, turn, time, tool-call count, model and Stop; each row's
   time; a row that opens to the call's full input and result (`lib/log/agent-events.ts` keeps only a summary
   today); a Steps / Raw output switch.
4. **Notion tab**: the page's title, status and last edit in its card (needs the worker or `NotionApi` to read
   the page's properties).
5. **New ticket dialog** (board "New ticket dialog"): Write / Preview on the description, attached files as chips
   under it, the flow's steps under the switch, Cancel beside Create ticket, Ctrl/⌘ Enter to create.
6. **Pages not redesigned yet**: a step's output tab (`components/steps/step-tab.tsx` and its notices), the
   review's Ticket and Report tabs beyond their cards, Union Tools and Connectors lists, the GitHub App page (its
   header sits outside its card), the onboarding wizard, the setup agent's proposal cards, the guide.
7. **Dark mode pass** over every page above: each was checked in light; only the PR tab was checked in dark.

Two ideas on the inner canvas are new features, not design: "Draft with the agent" on a Notion comment and "Start
it now" in New ticket. Ask the user before building either: both spend Claude usage or start work.

## How the work was done

- A worktree per step (`git worktree add -b <branch> ../union-next-<name> main`, then `bun install`).
- A temporary `apps/web/vite.uicheck.config.ts` serving the worktree's client on 5174 with `/api` proxied to the
  live instance on 5173, and throwaway Playwright scripts on `scripts/ui-check/browser.ts` (`openApp` blocks every
  write) taking screenshots to the scratchpad. Delete both before committing.
- `bun run check`, then commit with the hook, `bun run active`, `git merge --ff-only` into the live checkout. Only
  client files changed: no restart needed. Update the user guide page that covers what changed.
