# Plan: Explain as conversations, in their own tab

Status: built (2026-11-16, branch `explain-conversations`). Step 1: conversations and turns in the database, the
migration of the existing threads, the API and the worker. Step 2: the Explain tab, the side panel and its toggle
removed, Explain file asking about the file as a subject. Step 3: the split buttons with New conversation and Add to,
drafts kept in the browser, the notice, Explain the whole change in the tab (not in the review header, which has no
room). Step 4: the gutter marks, from answers on the commit shown only. Step 5: the docs, written with each step. Decisions settled at the end.

## Idea

Today **Explain** is a side panel on the review page: each ask is a thread pinned to one range of lines, follow-ups
chain under it (`review_explanations.parent_id`), and threads pile up newest first. You cannot ask about two places
at once ("how does `a.ts:40` reach `b.ts:12`?"), a follow-up cannot bring in new lines, and the panel squeezes the
diff.

Make Explain work like Investigations: an **Explain** tab on the review page (beside Diff and Report) holding
**conversations**. A conversation has a title and turns, oldest first. A turn is a question plus the **subjects**
attached to it: lines, a hunk, a file or the whole change. From the diff, every Explain entry point offers **New
conversation** or **Add to "…"** (an existing one), so a conversation can gather several parts of the change.

## Model

- **`review_explain_conversations`** (new): id, owner (`reviewOwnerColumns`: a ticket's branch or a pull request
  under review), `title` (the first question or subject, editable), `createdAt`, `updatedAt`. The session to resume
  is read from the turn before (built: no `sessionId` on the conversation).
- **`review_explanations`** becomes a turn: add `conversationId` (not null after migration), keep `question`,
  `specs`, `headSha`, `status`, `result`, `sessionId`, `error`, timestamps. The line columns move into
  `subjects` (json): a list of
  - `{ kind: 'lines', path, side, start, end, excerpt }` (a selection or a hunk),
  - `{ kind: 'file', path }`,
  - `{ kind: 'change' }` (the whole diff: its file list with line counts).

  A turn may have no subject (a plain follow-up). `parent_id` and the line columns are dropped after the migration.

- **Migration**: each root explanation becomes a conversation (title from its question, else `path:start-end`), its
  `parent_id` chain the turns of it, its lines one `lines` subject. Nothing is lost; old threads show as
  conversations.
- **Drafts**: subjects added to a conversation before its question is sent are kept per conversation in the
  browser (as the comment drafts are), not in the database: nothing runs until **Send**.
- `ExplanationResult` stays as it is (How it works, Specs, Docs, Not in the spec, dropped count), per turn.

## Rules

- One turn waits per conversation (was: per range of lines); several conversations can be queued, and the runner
  still takes one per review at a time on the shared run slots.
- A turn records the commit the review showed. A turn on an older commit is **Outdated** as today; a conversation
  can go on after a push: the next turn's prompt says the change moved from `<old>` to `<new>`.
- Subjects reach the agent as today's lines do: `lines` with their excerpt and side (old lines through
  `git show <base>:path`), `file` as its path, its line counts and the git command for its diff, `change` as its file list with counts
  (built: no hunk index; the agent reads the diff with git). Spec parts from the newest grouping are added per `lines` subject.
- **Resume**: a ticket's conversation resumes `sessionId` with a follow-up prompt carrying only the new turn's
  subjects and question. A pull request's runs in a fresh throwaway container with the earlier turns as text
  (questions, subjects named, answers' `explanation`), the oldest dropped past a budget (say the last 6 turns or
  ~20k characters), as `threadOf` does today without a cap.
- A long ticket session grows its context on every turn: past a size (the implementer's limit in
  [agent-token-savings.md](../agent-token-savings.md), step 3), start a fresh session with the turns as text.
- The agent stays `review_explain` (Haiku, read-only tools). Each turn is one run on the user's Claude usage, as
  today.

## UI

- **Explain tab** (after Report), counted when a turn waits or runs. Left: **New conversation**, a search, the
  conversations newest activity first (title, subject count, state dot). Right: the open conversation, as
  `investigation-thread.tsx` does: each turn's subjects as chips (`path:12-30`, `path`, "the whole change"), each a
  link that opens the Diff tab on them, the question in a bubble, the answer card (`explanation-answer.tsx`, as
  today, with **Copy as comment**), the progress with **Cancel**; at the foot the composer: attached subjects as
  removable chips, the question, **Send** (Ctrl+Enter). Header actions: rename, **Export as Markdown**, **Delete**
  (`ConfirmButton`).
- **Entry points on the diff** (the editor under selected lines, a hunk header, **Explain file**, and a new
  **Explain the change** on the Explain tab and the review header): a split button. The main part, **Explain**,
  asks in a new conversation right away (with the optional question, as today). Its menu: **New conversation**, then
  **Add to "…"** for the current conversation and the three most recent. Adding attaches the subject to that
  conversation's draft and stays on the diff, with a toast "Added to «title» · Open", so several parts can be
  gathered before asking.
- **Only the tab**: the side panel and the header's Explain toggle (`view-toggle.tsx` keeps Unified / Split) go
  away; the diff gets its full width back. The main **Explain** click opens the Explain tab on the new conversation,
  where the answer comes; **Add to** stays on the diff. The tab remembers the open conversation, so going to the Diff
  from a subject chip and back to Explain returns to it.
- **Current conversation**: the last one opened or added to, listed first under **Add to**.
- In the diff, lines that a conversation's subject covers get a small gutter mark that opens it in the tab (step 4).
- The tab and the open conversation are kept in the URL (`?tab=explain&conversation=<id>`), so a link opens it.

## Steps

1. **Core and worker.** Schema, migration of the existing explanations, `review-explanations.ts` around
   conversations (queue a turn, one waiting per conversation, thread read by `conversationId`), the API
   (`explanation-request.ts`: subjects instead of lines; list, rename, delete conversations), prompts for several
   subjects of three kinds, resume per conversation, the history budget. Tests: the migration on a copy of a
   database with threads, `queueExplanation` rules, the prompt with each subject kind, resume vs. fresh.
2. **Explain tab.** List, conversation, composer, export, delete; the side panel and its toggle removed, its
   content moved into the tab. The current entry points start a new conversation and open the tab on it.
3. **New or Add to.** The split button on every entry point, the drafts, **Explain the change**, the toast, the
   current conversation.
4. **Marks in the diff.** The gutter marks on lines a conversation covers, opening it in the tab (built: a tinted
   line number with an indigo bar on each line, a `?` on a range's first line opening the newest conversation; only
   answers on the commit shown, since older ones' lines may have moved).
5. **Docs.** `docs/spec/pull-requests.md` (Explain), `documentation/reviewing.md` (Explain), the maps.

Each step is checked in the browser (`scripts/ui-check/`), and step 1 against real Docker on ticket 9001 with a
mocked agent; one real run on Haiku only when the user agrees.

## Later

- Explain from the **Repository** tab (a file at a commit, no diff): the same conversations, owned by the project
  instead of a review. Needs the throwaway container cloned at that commit, as a pull request's.
- **Turn into an investigation**: carry a conversation over when the question outgrows the change.

## Decisions (2026-11-16)

1. **Scope**: conversations belong to a review (a ticket's branch or a pull request); per project is for later,
   with the Repository tab.
2. **No side panel**: Explain lives only in its tab.
3. **The main Explain click** asks right away in a new conversation; the menu holds New conversation and Add to.
