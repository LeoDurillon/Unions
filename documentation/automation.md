# Automation and notifications

## Notifications

The sidebar's **Notifications** bell counts what happened while you were away, across projects:

| Badge                     | When                                                      |
| ------------------------- | --------------------------------------------------------- |
| **Approval**              | A step waits for your approval.                           |
| **Failed**                | A step or an investigation failed.                        |
| **Commit refused**        | A git hook refused the agent's changes.                   |
| **Usage limit**           | Your Claude usage limit stopped a run.                    |
| **Blocked**               | A ticket moved to In progress before its parent was done. |
| **Merged**, **Closed**    | A ticket's pull request was merged or closed.             |
| **Checks failed**         | A ticket's pull request's CI checks turned red.           |
| **Re-run failed**         | GitHub refused to re-run a CI job.                        |
| **Answered**              | An investigation finished.                                |
| **Rule**, **Rule failed** | An event rule notified you, or failed.                    |

Notifications are grouped by ticket or investigation, newest first. Click one to open what it is about. **Mark all
read** and **Delete all** clear the list. At the bottom of the panel, you can turn on **desktop notifications**, so
your browser tells you even when Union is in a background tab.

## Event rules

Event rules do something elsewhere when something happens to a ticket: set a property of its Notion page, move its
Jira issue, comment on GitHub, add a label, notify you. Set them up in the project's **Settings → Events → Rules**.

A rule has a trigger and one or more actions.

**Triggers**

- The ticket is created
- The ticket moves to a board column
- A step waits for your approval (any step, or one)
- A step fails
- The ticket gets a pull request
- Its pull request is ready for review
- Its pull request is merged
- Its pull request is closed without merging
- Its pull request's CI checks fail
- You post a review of its pull request (any verdict, or Approved, Changes requested, Commented)

**Actions**

- **Set properties of the ticket's Notion page**: a status, a URL, a date… for tickets imported from Notion or
  [linked to a page](tickets.md#link-a-ticket-to-its-notion-page), and for pull requests under review linked to a
  Notion page.
- **Comment on GitHub**, on the issue or the pull request.
- **Update the ticket's pull request**: labels, reviewers, assignees, title or description.
- **Set fields of the ticket's GitHub Project item**.
- **Notify me in Union**.
- **Move the ticket's Jira issue** to a status of the Jira project, for tickets imported from Jira. Union finds the
  transition of the issue's workflow that leads there; an issue already in that status is left as it is. If the
  workflow has no way there from the issue's status, or the transition asks for fields (often a Resolution on
  Done), the rule fails and its Activity line says why.
- **Set fields of the ticket's Jira issue**: one-line or multi-line text, a number, a date, a select's option (by
  its name, as Jira shows it), or labels to add. Union reads the fields a rule can set when you connect Jira; a field
  added in Jira later shows after **Refresh from Jira** above the rules.
- **Comment on the ticket's Jira issue**: plain text, links become links.

The Jira actions act as the Atlassian account whose API token the project uses: Jira shows the changes under its
name, and the account needs the **Transition issues**, **Edit issues** or **Add comments** permission in the Jira
project. A rule that lacks one fails, naming it.

Text values are templates. Use these variables in them:

| Variable                           | Value                                             |
| ---------------------------------- | ------------------------------------------------- |
| `{ticket.title}`                   | The ticket's title                                |
| `{ticket.id}`                      | Its number in Union                               |
| `{ticket.branch}`                  | Its branch                                        |
| `{issue.number}`, `{issue.url}`    | Its GitHub issue                                  |
| `{pr.number}`, `{pr.url}`          | Its pull request                                  |
| `{board.status}`                   | Its column: Backlog, In progress, In review, Done |
| `{step}`                           | The step that waits or failed                     |
| `{review.verdict}`, `{review.url}` | The review you posted                             |
| `{date.today}`, `{date.now}`       | Today's date, or the date and time                |

For example, a rule "Its pull request is merged → set the Notion page's **Status** to _Shipped_ and **Shipped on**
to `{date.today}`" keeps a Notion roadmap up to date with no manual step.

**Settings → Events → Activity** shows what the rules did lately: when, which rule and ticket, and what each one set,
or why it failed.
