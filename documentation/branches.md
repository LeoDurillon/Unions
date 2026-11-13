# Branches and pull requests

The ticket panel's **PR** tab gathers everything about the ticket's pull request: its link, its CI checks, its
GitHub discussion, and the operations that rewrite its branch.

## The pull request

Union opens a draft pull request after the implementation, unless you turned that off in **Settings → Pull
requests**. Its description follows the repository's pull request template (in `.github/`, the root or `docs/`),
in the template's language, and ends with `Closes #<issue>`.

- The tab opens on a card for the pull request: its state, its number and title on GitHub, its branch and base,
  **Open on GitHub**, and **⋯ → Unlink the pull request**. Without one, **Link** a pull request by number or URL
  when you opened one yourself.
- Under it, a card for the branch: how far it is behind its base, with **Rebase** when it is, and the button that
  opens the other branch operations (see [More actions](#more-actions)).
- **CI checks** shows a bar of the checks on the last commit (failed, running, passed, skipped) with their counts,
  then the failed and running ones; past the first few running checks, and the passed and skipped ones, fold
  away behind a line you click.
- **Rewrite description** writes the description again from the current code; you review the draft before it is
  sent to GitHub. The draft opens as it will read on GitHub (**Preview**); **Edit** changes its text, and
  **Changes from GitHub's** shows what it changes line by line.
- **Line comments** come first: the open threads, then the resolved ones folded behind a line you click.
- **In the review** lists the comments you added to the next review; they leave the list once you send it.
- **Discussion on GitHub** shows the pull request's comments and reviews, one row each with its author, and
  **All**, **People** and **Bots** to show only some, with how many each shows. A bot's comment shows its first line
  until you click its author. **Add to review** on a row adds it to the next review you send. Import its line comments into a
  review with **Import** (see [Reviewing changes](reviewing.md#comment-and-send)), or answer them where you read
  them (see [Reply to comments](#reply-to-comments)). Click a line thread's file and lines to open them in the
  review's diff.

## Reply to comments

Under each line thread, **Reply** opens a box: write your answer, tick **Resolve the thread** if it is settled, and
click **Send**. Under a review summary or a conversation comment, **Quote reply** opens the box with the comment
quoted and its author named, since GitHub cannot thread those; **Send** posts a new comment on the pull request.
The box says who posts: the GitHub App's bot, or the project's token. Your reply shows as "Sending…" until GitHub
has it, then appears in the discussion. If GitHub refuses it, the box opens again with your text and the reason.

**Suggested replies.** When you send a review that includes comments imported from GitHub, the implementer
writes a reply to each of them once its changes are pushed: what it changed and in which commit, or why it did
not. They appear under their threads and comments as **Suggested reply**, with **Send**, **Edit** and **Discard**,
and **Send all replies** above the discussion. Nothing is posted until you send it. Turn this off in the project
settings, under **Pull requests**.

The Comments tab of a pull request you review (see [Reviewing changes](reviewing.md)) has the same Reply and Quote
reply.

## CI checks

While the pull request is open, the PR tab lists its CI checks on the last commit, and the comments bots left on
it. The ticket's card on the board shows **Checks running**, **Checks passed** or **Checks failed**, and Union
notifies you when they turn red.

To have the agent fix a failure:

1. Tick the failed checks, other GitHub Actions jobs, or bot comments that explain it.
2. Union reads each one into text (the check's annotations and failed step's log, the job's log, the comment) and
   shows you what the agent will get.
3. Keep it for the implementer's next run, or **send it now** as a revision with a note (at the final review or
   once Done).

**Re-run** asks GitHub to run a failed Actions job again, with the jobs that depend on it.

With a GitHub App, CI checks need the Checks, Commit statuses and Actions permissions (see
[Your first project](first-project.md#use-a-github-app)).

## Rebase

When the base branch moved on, the PR tab says how far behind the branch is ("4 commits behind `main`") and offers
**Rebase**. It is available at the final review, or once Done while the pull request is open.

1. Union rebases the branch itself first. If git applies it cleanly and the checks pass, Union pushes it: no agent
   runs, and the final review stands.
2. If git stops on a conflict, or the checks fail after the rebase, the implementation agent resolves it, in its own
   session, and runs the checks. Union then pushes, and the final review runs again, since the code changed.
3. If someone else pushed commits to the branch, Union stops before rewriting it, so their work is never lost.
   Union usually notices first and asks you to resync (see below).

Union pushes with `--force-with-lease`. If anything fails, the branch is put back exactly as it was, unpushed, and
**Retry** runs the rebase again.

## When someone else pushes to the branch

When a co-worker pushes to the ticket's branch on GitHub, or rebases or force-pushes it, Union's copy of the branch is
out of date. Union notices at its next check of GitHub. The card on the board shows **Branch moved**, and the PR tab
says "New commits were pushed to `<branch>` on GitHub" or "`<branch>` was rewritten on GitHub", with the commit
Union had and the one GitHub has now.

Until you resync, **Rebase**, **Revise**, **Retry**, **Simplify history**, **Split into a stack**, **Restack** and
**Change target** are unavailable: they would start from the old code, or their push would be refused.

Click **Resync from GitHub**. Union fetches the branch and puts its copy on it, then updates the diff on the Review
tab. Nothing is pushed, no agent runs, and the ticket stays where it is (at its final review, or Done). The next time
the implementation agent works on the ticket, it is told the branch changed and reads the files again.

If Union holds work it never pushed (a revision that stopped before its push, for example), the resync changes
nothing and the PR tab lists those commits. Retry or revise the step first, so its work is pushed, or ask for help.
A ticket split into a stack cannot be resynced yet.

## When the base moves on GitHub

When a ticket [depends on another](tickets.md#dependencies), its pull request targets the parent's branch. Once the
parent's pull request is merged and GitHub deletes that branch, GitHub moves the child's pull request onto the
parent's target. Union follows: the PR tab says "`<old>` was merged (#n): the pull request now targets `<new>`", and
the next **Rebase** moves only the ticket's own commits onto the new base, even after a squash merge.

## More actions

While the pull request is open, the branch card has a button for the operations you need less often:
**Change target**, **Simplify history** and, when stacks are turned on, **Split into a stack** (it reads **Change
target, simplify, split ▾**). Click it to open them in the card, and again to close them. A ticket split into a stack has none of them there: its [stack panel](#the-stack-panel) holds its own.

## Change target

To move a finished ticket onto another base, for example a fix built on `develop` that must ship as a hotfix on
`main`, open the branch card's **Change target, simplify ▾** in the PR tab and click **Change target**. Pick the branch (the button reads **Pick a
branch** until you do), then click **Retarget onto `<branch>`**.

Union moves only the ticket's own commits onto the new branch (the old base's commits stay behind), pushes, and
changes the pull request's base on GitHub. As with a rebase, an agent runs only on a conflict or failing checks, and
the final review then runs again. It is available at the final review or once Done, while the pull request is open.

## Simplify history

**Simplify history** asks the implementation agent to rewrite the branch's commits into a history a reviewer can
read commit by commit: fix-ups folded in, one commit per logical change, messages in the repository's style.

The code must not change, and Union checks it: the final tree must be identical to the one before, from the same
fork point. Then Union pushes, and the ticket goes back to where it was (final review or Done). If a git hook
refuses a commit, you choose between committing without the hooks and keeping the old history.

On a ticket split into a stack, **Simplify history** is in the stack panel and works slice by slice: each slice's
commits are rewritten, but no change moves to another slice, and every slice must end with the same code as before.
After a slice was merged into the base, click **Restack** first.

## Split into a stack

A pull request too big to review can become a stack of smaller pull requests, each merged on top of the one below.
Turn on **Split pull requests into stacks** in **Settings → Pull requests** first.

1. **Split into a stack** in the PR tab asks an agent for a plan: one slice per part of the spec, each with its
   description and why it stands on its own. **Approve and split**, **Request revision**, **Edit**, or **Drop the
   split**.
2. The implementation agent rewrites the commits into those slices. Union checks that the code is the same and, with
   **Check every slice** (on by default), runs the project's checks on each slice.
3. Union pushes every slice's branch in one atomic push and opens one pull request per lower slice; the ticket's own
   pull request becomes the top of the stack. Each slice gets its own description, and the stack becomes a GitHub
   stack where GitHub supports it.

The stack stays one ticket, with one card and one issue. Approving its final review marks every slice's pull
request ready. The review page shows each slice as a tab, and **Review with agent** reviews slice by slice. The review page's PR tab follows the slice you pick: it shows that slice's pull request (the top one under **All**), and picking a pull request there shows its slice's diff. The browser's Back and Forward buttons move between the slices you looked at, and the page's address keeps the slice, so a reload or a copied link opens on it.

Merge the slices from the bottom, on GitHub. After each merge, Union brings the slices above onto the base (GitHub
does it itself for a GitHub stack). If that hits a conflict, the step fails without pushing anything; click
**Restack** and the agent resolves it. The ticket counts as merged once every slice is merged.

### The stack panel

Once the ticket is split, its PR tab shows the stack as one panel, bottom slice first (slice 1 merges first). Each
line is a slice: its pull request, its state, its title and its CI in one word (failed, running or passed; hover it
for the counts). The CI is read again every 30 seconds while a check runs.

Under the slices, the panel says how far the stack is behind its base, and offers:

- **Rebase stack** (when the stack is behind): moves every slice onto the base at once, runs the checks and pushes them together. As with a
  [rebase](#rebase), an agent runs only on a conflict or failing checks.
- **Restack**: shown once a slice was merged; brings the slices above onto the base.
- **Simplify history**: see [Simplify history](#simplify-history).
- **Split again**: an agent plans new slices from the same code, and they replace the current stack.
- **Rewrite all descriptions**: the agent rewrites each open slice's description, one after the other. Review and
  send each draft from that slice's pull request below.

The panel warns when the stack cannot go on as it is: a slice merged into another slice's branch instead of the base
(its code is not in the base: merge the slices below it, or revert it on GitHub), or a slice closed without a merge
(the stack stops there). **How the stack merges** at its foot explains the merge order for this stack.

Below the panel, pick which slice's pull request the CI checks, the description and the discussion are about. They
start on the top one, the ticket's own pull request.
