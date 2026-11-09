# The board and tickets

Each project has a board with five columns. With a GitHub Project connected (**Settings → Integrations → GitHub
Project**), Union keeps it in step with the Project in both directions: each ticket's issue is a card there, and
moving a card to In Progress on GitHub starts the ticket. Without one, Union's board is the only board.

| Column              | What is in it                                                                    |
| ------------------- | -------------------------------------------------------------------------------- |
| **Backlog**         | Tickets that have not started.                                                   |
| **In progress**     | Tickets whose planning or implementation is running or waiting for you.          |
| **In review**       | Tickets at the final review, or running a rebase or another branch operation.    |
| **Done**            | Tickets whose final review you approved. Their pull request is ready for review. |
| **Merged / Closed** | Tickets whose pull request was merged or closed in the last three weeks.         |

Each card shows the ticket's state ("Waiting for you · Technical", "Running · Implementation"), its issue number (when it has an issue), the
ticket it depends on, and the CI checks of its pull request. It also shows the flow's name when it is not Full, a split
ticket's stack ("Stack of 3 · 1 merged"), **Branch moved** when someone pushed to its branch on GitHub, and, in Merged / Closed,
**Merged** or **Closed**. "Rate limited" means the step waits for your Claude usage limit to reset; "Commit refused"
means a git hook of the repository refused the agent's changes (see
[When a step stops](ticket-lifecycle.md#when-a-step-stops)). Fold a column you do not need with its arrow; Merged /
Closed starts folded.

While an agent works on a ticket, its card also shows how long the run has gone and the last thing the agent did:
the tool it called (`Edit src/api/client.ts`, `Bash bun test`) or the first line of what it wrote. The line
refreshes every few seconds. When the agent has written nothing for two minutes, the card says when its last
message came ("last message 5 min ago"), so a run that seems stuck shows without opening it. The ticket's **Log**
has the whole story.

Above the board:

- **Search** finds tickets by title, issue number (`#36`) or pull request number.
- **Needs you** shows only the tickets waiting for you, with their count: a step to approve, a question to answer,
  a failed run, a refused commit, or failed CI checks on an open pull request.
- Once some tickets came from Notion or Jira, **All**, **From Notion**, **From Jira** and **From GitHub** show only
  the tickets of one origin. **From GitHub** keeps the tickets written in Union or imported from a GitHub issue.

Press **/** to jump to the search, **c** to write a new ticket, and **n** to open the first ticket that needs you;
when none of this project's does, **n** goes to the next project that has some.

In the sidebar, each project shows how many of its tickets wait for you (an orange number), and a blue dot while one
of its steps runs, so you can see another project needs you without opening it.
Press **?** anywhere for the list of [keyboard shortcuts](#keyboard-shortcuts).

## Create a ticket

Click **New ticket** in the project bar. The dialog has one tab per source:

- **Write**: a title and a description in Markdown. The description becomes the GitHub issue's body (when the
  project mirrors tickets as issues), so write it for the agents and for your colleagues: the problem, what you
  expect, and anything they must not change.
- **Import from GitHub**: choose **Issue** or **Pull request**, then give its number or URL.
  - An **issue**: the ticket uses that issue instead of creating one, and keeps following its title and
    description on GitHub.
  - An open **pull request**: the ticket works on the pull request's own branch, so whatever the agent does is
    pushed to it. If the pull request closes an issue Union already worked on, the ticket takes that issue and
    picks up the planning steps Union wrote there; otherwise it takes the pull request's title and description and
    runs the Quick flow. Click **Fetch** to see which issue, steps and flow the ticket gets before you create it.
    The ticket waits for you at Implementation, with the pull request's changes in its Changes tab: **Approve**
    runs the final review, **Request revision** has the implementer change the pull request. Pull requests from
    forks, and closed or merged ones, cannot be imported.
- **Import from Notion** (when the project is connected to Notion): a page of the connected data source. Union
  copies its text (an embedded Figma file, video or bookmark becomes its link, which the agents can open),
  and keeps its images and attached files (PDFs and other uploads) as the ticket's files, which
  the agents can read. Files above the size limits (25 MB each, 100 MB per ticket) stay as links to Notion,
  which stop working after about an hour. Click **Edit before creating** to change the text first.
- **Import from Jira** (when the project is connected to Jira): the key (`ABC-123`) or link of an issue of the
  connected Jira project. A board link with the issue open works too. Union copies its summary as the title and its
  description as Markdown, with tables, code blocks, checklists and panels. It keeps the issue's images and
  attached files as the ticket's files, which the agents can read: those the description shows stay in place, the
  others are listed under **Attachments** at the end. Files above the size limits stay as links to Jira. The ticket
  links back to the issue. Importing only reads the issue: Union writes to Jira only when you comment from the
  ticket's **Jira** tab, or when one of your [event rules](automation.md#event-rules) acts on it.

Every tab except the pull request import lets you pick the ticket's **flow** (see below). The **Write** tab also
lets you:

- attach **files** (screenshots, specs, sample data), which the agents can read;
  spreadsheets, Word documents and zip files too, when the agent's tools include `Bash(unzip -l *)` and
  `Bash(unzip -p *)` (select them under **Tools** on the agent's page in **Union settings**);
- pick the ticket it **depends on** (see below).

To attach files to an imported Notion page or Jira issue, or give it a parent, click **Edit before creating**: the
ticket opens in the **Write** tab, still linked to its page or issue. You can also add files later, in the ticket's
Overview.

The new ticket lands in Backlog. Union creates its GitHub issue, unless the project turned issues off (**Settings →
General → Mirror tickets as GitHub issues**), and adds it to the GitHub Project when one is connected.

To change the title or description later, use **Edit** in the ticket's **Overview**. Union writes the change to the
issue, unless someone changed the issue on GitHub after you started editing: then nothing is written, and Union
says so. Steps that already ran do not run again.

## Link a ticket to its Notion page or Jira issue

A ticket written in Union (or imported from GitHub) can be linked to its Notion page afterwards, when the project
is connected to Notion. In the ticket's **Overview**, the **Notion** row has **Link a Notion page**: paste the
page's URL, click **Check** to see its title, then **Link**. Any page shared with your Notion integration works,
not only pages of the connected data source.

The ticket's description stays as you wrote it. From then on the ticket behaves like one imported from that page:
[event rules](automation.md) set its properties, and the page is one of the specs when you group a diff by spec or
review with an agent. **Change** links another page, **Unlink** removes the link; neither touches the page in
Notion.

The same works for Jira, when the project is connected to Jira: the **Jira** row has a **Link a Jira issue** field.
Paste the issue's key (`ABC-12`) or link in it, **Check** shows its summary, then **Link**. The issue must be of
the project's Jira project. From then on the ticket has its **Jira** tab and your Jira rules apply to it; **Change** and
**Unlink** work as for Notion, and leave the issue as it is in Jira.

A ticket comes from one tracker: a ticket linked to a Notion page has no **Link a Jira issue** field, and the other way
round. Unlink it first to link it to the other tracker.

## Start a ticket

Click **Start** on the card or in the ticket's Overview: the card moves to **In progress** at once and says
**Starting…** until the agent begins. If the start is refused, the card goes back to Backlog with the reason on it. With a GitHub
Project connected, moving the ticket's card to In Progress there works too.

Union creates the ticket's container and volumes, clones the repository into it, and runs the first step of the
ticket's flow. What happens next is in [From ticket to pull request](ticket-lifecycle.md).

## Flows

A flow is the list of steps a ticket runs. Implementation and the final review always run; the planning steps and
your [custom agents](agents.md#custom-agents) are optional. Steps a flow skips never run, so they cost nothing.

| Preset       | For                                                                           | Steps                                                               |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Full**     | A feature nobody has thought through yet: the most common case, the default   | Intake, Summary, Technical, Test plan, Implementation, Final review |
| **Standard** | A feature already thought through, or a small one (a button with an API call) | Technical, Implementation, Final review                             |
| **Quick**    | A really small fix that needs no thinking: a typo, a wording change           | Implementation, Final review                                        |

- Pick a flow in the New ticket dialog, or in the **Flow** row of the Overview while the ticket is in Backlog.
  **Custom** lets you choose the planning steps one by one and place custom agents.
- A ticket that picked none follows the project's default flow (Full, unless you change it).
- Edit the presets and choose the default in **Settings → Flows**.
- Starting a ticket fixes its flow: changing a preset later never changes a ticket that already started.

The flow picker shows what the chosen flow is for. In **Settings → Flows** you can write that line for your own
presets too.

## Dependencies

A ticket can depend on one other ticket of the same project, its **parent**. Set it in the New ticket dialog, or in
the Overview while the ticket is in Backlog.

- The ticket cannot start until its parent is **Done**. Its card says "Waiting for parent" and has no **Start** button.
- It then starts from the parent's branch while the parent's pull request is open, and its own pull request targets
  that branch. If the parent's pull request is already merged, it starts from the project's base branch.
- Every agent of the ticket reads the parent's title and description.
- On GitHub, the ticket's issue is marked "blocked by" the parent's issue.

When the parent's pull request is merged and GitHub deletes its branch, GitHub moves the child's pull request onto
the next base, and Union follows. See [Branches and pull requests](branches.md#when-the-base-moves-on-github).

To start from another branch than the automatic one, pick it in the Overview's **Base branch** row before the
ticket starts.

## The ticket panel

Click a card to open its panel:

- **Overview**: the description, where the ticket comes from, its parent and the tickets that build on it, its
  files, the base branch and flow, the **Start** and **Cancel ticket** buttons, and every run with its model,
  duration and token usage.
- **Preview**: the ticket's [preview environment](previews.md), its end-to-end tests and commands.
- **Steps**: one tab per step with the agent's output, then the **Log**, which shows what the agent does live.
- **PR**: the ticket's pull request, its CI checks and branch operations. See
  [Branches and pull requests](branches.md).
- **Notion**: the open comments of the ticket's Notion page, for a ticket imported from Notion or linked to a page.
  Comments on the whole page come first, then those on a passage of the text, under the passage they are about.
  **Open in Notion** opens a discussion there; **Refresh** reads the comments again. Resolved comments are not
  shown. **Reply** under a discussion answers in it; **New comment** at the bottom starts a discussion on the
  page. **Add to review** puts the whole discussion in the ticket's review, for the implementer with your next
  **Send review** (see [Reviewing](reviewing.md)); it shows **In the review** after. You can write `**bold**`, `` `code` `` and `[links](https://…)`. The comment shows "Sending to Notion…"
  until Notion has it, then the tab reads the comments again; if Notion refuses it, the box opens again with your
  text and the reason. Comments appear in Notion under your integration's name. Your Notion integration needs the
  **Read comments** and **Insert comments** capabilities (in Notion, the integration's settings, then
  **Capabilities**); without them the tab says which.
- **Jira**, in the Notion tab's place for a ticket imported from Jira (the Overview's **Jira** row links the issue,
  and once the tab has read them says how many comments it has; see
  [Link a ticket to its Notion page or Jira issue](#link-a-ticket-to-its-notion-page-or-jira-issue)): the issue's comments, oldest first, each with
  its author, time ("edited" when changed), **Open in Jira**, and a badge when not everyone can see it (a role or
  group, or an internal note). **Refresh** reads them again; an issue with more than 500 comments shows the latest 500. **Reply** under a comment posts a new comment that starts with a mention of its author, so Jira notifies
  them (Jira comments have no threads); **New comment** at the bottom posts a plain one. You can write
  markdown: `**bold**`, `` `code` ``, `[links](https://…)`, lists, code blocks and quotes keep their shape in Jira
  (inline code cannot be bold in Jira, so bold around it is dropped). Comments are posted as the Atlassian account of the project's Jira connection and visible to everyone
  who can see the issue. The comment shows "Sending to Jira…" until Jira has it; if Jira refuses it, the box opens
  again with your text and the reason (the account needs the **Add comments** permission in the Jira project).
  **Add to review** puts the comment in the ticket's review, for the implementer with your next **Send review**;
  it shows **In the review** after.

**Investigate** in the panel header asks an agent a question about this ticket's workspace (see
[Investigations](investigations.md)). **Review changes** opens the diff (see [Reviewing changes](reviewing.md)).

When other tickets wait for you, **Next needing you** in the header opens the next one, in the board's order (its
badge says how many there are). Use it after approving a step to go straight to the next thing to do.

## Keyboard shortcuts

Press **?** to see them in Union, or click **Help** in the sidebar, then **Keyboard shortcuts**. They do nothing while you type in a text field or while a dialog is open, and
Ctrl, ⌘ and Alt combinations stay the browser's.

| Where       | Key       | What it does                                                                |
| ----------- | --------- | --------------------------------------------------------------------------- |
| Anywhere    | **?**     | List the shortcuts.                                                         |
| Board       | **/**     | Jump to the search.                                                         |
| Board       | **c**     | Write a new ticket.                                                         |
| Board       | **n**     | Open the first ticket that needs you, else go to the next project with one. |
| Ticket      | **n / p** | Open the next or previous ticket that needs you.                            |
| Ticket      | **r**     | Review the changes.                                                         |
| Ticket      | **1 – 5** | Switch to Overview, Preview, Steps, PR, or Notion or Jira.                  |
| Ticket      | **Esc**   | Close the panel.                                                            |
| Review page | **j / k** | Open the next or previous file.                                             |
| Repository  | **/**     | Jump to **Go to file**.                                                     |

## Cancel and remove

**Cancel ticket**, in the Overview of a ticket that is not Done, stops the ticket: a running step is stopped (the
agent too, within a few seconds), nothing it does after is kept or pushed, and the card goes back to Backlog marked
**Cancelled**; its run shows **Cancelled** in the Log. Its open pull requests are closed on GitHub (so a ticket that
had one moves on to **Merged / Closed**, marked **Closed**), and its issue is closed as not planned; a merged pull
request stays as it is, the branch is kept, and you can reopen either on GitHub, which Union leaves alone. Once the
agent stopped, Union removes the ticket's preview, container and workspace (the branch on GitHub stays). A cancelled
ticket can then leave Union with **Remove for good**, in its Overview: its runs, outputs and files are deleted.
Nothing brings it back.
