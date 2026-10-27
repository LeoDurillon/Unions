# Reviewing changes

Union has a full-page review for two kinds of change: a ticket's branch, and any pull request of the repository,
including ones written by people.

![The review page](../docs/screenshots/review.png)

## Review a ticket's branch

Click **Review changes** in a ticket's panel. The page opens on the **Diff** tab:

- On the left, the changed files, as a **List** or a **Tree**. **By spec** groups them by the part of the spec they
  implement (see [Specs](#specs)).
- On the right, one file at a time, with syntax highlighting, **Unified** or **Split** (side by side). Union
  remembers your choice in this browser.
- The commit picker shows all the changes, the changes since your last review, or one commit at a time.
- Lock files are hidden by default. Hide other paths in the project's **Settings → Review**.

The other tabs show the ticket, its preview, its pull request and its [spec report](#spec-report), so you can check
the change against the request without leaving the page.

The diff is a snapshot Union takes after each implementation run, so it shows what the agent left, even before the
branch is pushed.

### Comment and send

1. Click a line number to comment on that line. Shift-click another line number to extend it to a block.
2. Your comments stay drafts in Union until you send them.
3. **Send review** sends them all to the implementer, as a revision. When it is done, the final review runs again.

You can send a review while the ticket waits for you at the implementation or the final review, or once it is Done
(its pull request open and not merged); from Done, the ticket goes back to In progress.

To bring in what people wrote on GitHub, click **Import from #\<PR\>** in the header (or **Import** in the PR tab).
Unresolved line comments become drafts on their lines, with the replies folded in. Review summaries and
conversation comments are offered one by one with **Add to review**, since bots post many of them. Comments whose
lines no longer exist show as outdated, with GitHub's excerpt. Once the implementer has worked on imported
comments, it drafts a reply to each for you to send (see [Reply to comments](branches.md#reply-to-comments)).

## Explain

Select lines and click **Explain**, click **Explain** on a hunk, or **Explain file** next to a file's name. An agent
answers in the **Explain** panel on the right:

- **How it works**, with links to the code it cites;
- **Specs**: quotes from the specs this code implements;
- **Docs**: the repository's own documents that relate to it;
- or **Not in the spec**, when nothing asked for it.

Ask a follow-up, or click **Copy as comment** to quote the answer in a draft comment on those lines. Explanations
asked on an older commit show as **Outdated**, with **Explain again**.

Each explanation is an agent run (Haiku by default) on your Claude usage. On a ticket, it is refused while the
ticket runs a step.

## Review with agent

**Review with agent** asks an agent to read the change against its specs and leave line comments. They arrive as
drafts, like yours: keep, edit or delete each one before you send the review.

## Spec report

The **Report** tab tells you, before you read the diff, what needs your attention and what you can skim, judged
against the change's specs. Click **Write the report**: an agent reads the specs listed there (the [Specs](#specs)
bar's) and the whole change, and writes:

- **How it works**: a small map of the change's main path (click a part to open it in the diff; the grey ones are
  not changed; the red numbers are the **Needs you** items about that part), and a walkthrough in a few steps:
  what happens, and why. Each why says where it comes from: **From the spec**, **From a commit** or **From a
  comment** (Union found those words there), or **Inferred** (the agent's reading, nothing checked it).
- **Needs you**: the few things to look at, most important first: a requirement done differently or missing,
  something nobody asked for (even inside a requirement that is done), a real risk, a question to settle before
  approving. Each has its lines and **Add as
  draft comment**. When nothing needs you, the report says so.
- **Read first**: the few files to start with, in order, each with why it matters and its key lines. While the
  report is current, these files carry a **Key** mark in the file list (hover it for the reason).
- **Skim**: the files you can go through quickly (wiring, renames, tests that mirror the code); click to open the
  list. They carry a **Skim** mark in the file list.
- **Requirements to check**, in the specs' own order: each **Partial**, **Missing**, **Done differently** or
  **Unclear in the spec**, with the spec's words, the code and the tests, and a note. Text the spec quotes (a
  label, a message) must match exactly, or the requirement is done differently. The ones **Done as asked** are
  folded: click to open them.
- **Not in the spec**: what the change does that nobody asked for, with a risk.
- **Risks**, **Questions** to ask the author, and **Docs to update**; at the end, the changed files the agent said
  nothing about, if any.

Not every item will be worth your time on every project. **Not useful** on an item hides it, and proposes a rule
for the next reports of this project ("Do not raise …"): edit it to cover the kind of item, or clear it to only hide
this one. The rule is kept on the Memory page under **Spec report**, where you can edit or remove it.

In the Diff tab, while the report is current, the open file starts with what the report says about it (**Read
first**, **Skim**, and the **Needs you** items about it), and the lines an item points at carry a red bar with the
item's number.

Click a file or its lines to open them in the Diff tab. **Add as draft comment** opens the comment editor on those
lines with the note: nothing is sent until you send your review. **Add the gaps to the review** adds one draft on
the whole change listing the requirements missing, partial or done differently, with their notes: edit it, then send
it with your review (to the implementer on a ticket, on GitHub for a pull request). **Copy as markdown** copies the
whole report.

Union checks what the agent cites: a quote not found in the specs, or a file that does not exist, is left out, and
the report says how many it dropped. A spec that repeats another (a ticket imported from a Notion page, and that
page) is sent once, and images in a spec are left out. When the change moves on (a new snapshot, a new commit on the
pull request), the report shows as **Outdated**, with **Run again**.

A report is one agent run (Opus by default) on your Claude usage. On a ticket, it is refused while the ticket runs a
step. While it runs, the tab shows **Cancel**.

## Specs

The **Specs** bar under the header lists what the change is supposed to do. Explain, Review with agent, Group by
spec and the spec report all read it.

- It starts with the ticket's description and the Notion page it came from, or the pull request's description.
- **Edit** opens the list: edit a spec's text for this review (it is marked "edited"), go back to its source with
  **Use the source**, remove it, or **Add a spec** from the pull request's description, the ticket, a GitHub issue
  or a Notion page.
- Sources are read again each time, so a page edited in Notion is read as it is now.

## Review other people's pull requests

The project bar's **Pull requests** tab lists the repository's pull requests: **Open**, **Closed** or **All**,
newest first, with their author, branches, review state and size. Stacks of pull requests show as one row.

- A pull request opened by Union for a ticket has **Open ticket**.
- Any other has **Add to reviews**, which puts it under **Under review** at the top of the tab, for this project.
  **Add stack to reviews** adds every pull request of a stack.

**Open review** opens the same review page, with these tabs:

| Tab             | What it shows                                                                                |
| --------------- | -------------------------------------------------------------------------------------------- |
| **Description** | The pull request's description, and the Notion pages it implements (**Link** a page here).   |
| **Comments**    | Its review summaries, conversation and line threads, each with **Reply** or **Quote reply**. |
| **Notion**      | The text of the linked Notion pages, once there are some.                                    |
| **Preview**     | A [preview](previews.md#previews-of-pull-requests-under-review) of the pull request's code.  |
| **Diff**        | The diff, comments, Explain and Review with agent, as for a ticket.                          |

**Send review** posts one review on GitHub, signed by your token or the GitHub App: **Comment**, **Approve** or
**Request changes**. Your overall note becomes its body, and each draft a line comment. Drafts on lines that are no
longer in the diff are quoted in the body instead. If GitHub refuses (for example, an approval of your own pull
request), your drafts stay, with GitHub's reason.

Removing a pull request from Under review deletes its drafts and stops its preview.

The list is read from GitHub when the tab opens, at most once a minute; click **Refresh** to read it again.
