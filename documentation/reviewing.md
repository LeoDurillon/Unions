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

The other tabs show the ticket, its preview and its pull request, so you can check the change against the request
without leaving the page.

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
lines no longer exist show as outdated, with GitHub's excerpt.

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

## Specs

The **Specs** bar under the header lists what the change is supposed to do. Explain, Review with agent and Group
by spec all read it.

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

| Tab             | What it shows                                                                               |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Description** | The pull request's description, and the Notion pages it implements (**Link** a page here).  |
| **Comments**    | Its review summaries, conversation and line threads, read only.                             |
| **Notion**      | The text of the linked Notion pages, once there are some.                                   |
| **Preview**     | A [preview](previews.md#previews-of-pull-requests-under-review) of the pull request's code. |
| **Diff**        | The diff, comments, Explain and Review with agent, as for a ticket.                         |

**Send review** posts one review on GitHub, signed by your token or the GitHub App: **Comment**, **Approve** or
**Request changes**. Your overall note becomes its body, and each draft a line comment. Drafts on lines that are no
longer in the diff are quoted in the body instead. If GitHub refuses (for example, an approval of your own pull
request), your drafts stay, with GitHub's reason.

Removing a pull request from Under review deletes its drafts and stops its preview.

The list is read from GitHub when the tab opens, at most once a minute; click **Refresh** to read it again.
