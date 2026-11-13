# Trackers: Notion and Jira

A tracker is where your team already keeps its work: a Notion database or a Jira project. Union connects a
project to one or both. Each ticket comes from one tracker at most, and the tracker is only read unless you, or one
of your rules, change something in it. Notion and Jira work the same way in Union; the
[last section](#what-differs-between-notion-and-jira) lists what is different.

## What Union does with a tracker

- **Connect it** in the setup wizard's **Integrations** step, or later under **Settings → Integrations**: see
  [Your first project](first-project.md) for Notion and [Connect Jira](first-project.md#connect-jira).
- **Import a ticket** from a page or an issue: **New ticket**, then **Import from Notion** or **Import from Jira**.
  Its text, images and attached files come with it. See [Create a ticket](tickets.md#create-a-ticket).
- **Link a ticket** written in Union to its page or issue afterwards, from the tracker's row in the ticket's
  **Overview**: paste a link or a key, **Check**, then **Link**. See
  [Link a ticket to its Notion page or Jira issue](tickets.md#link-a-ticket-to-its-notion-page-or-jira-issue).
- **Read and answer its comments** in the ticket's **Notion** or **Jira** tab, edit its properties there, and add
  a comment to the ticket's review for the implementer. See [The ticket panel](tickets.md#the-ticket-panel).
- **Act on it with rules**: set its properties or fields, move it, comment on it when something happens to the
  ticket. See [Event rules](automation.md#event-rules).
- **Review against it**: link the pages and issues a pull request implements in the review's **Description** tab;
  the review gets a tab per tracker, and the agents read the items as specs. See
  [Reviewing changes](reviewing.md).
- **Write to it from an investigation**: **Also create it in Notion** or **Also create it in Jira** adds the ticket
  an investigation writes to the tracker too. See [Investigations](investigations.md).

## What differs between Notion and Jira

### Notion

- A project imports from one **data source** (a database). Linking a ticket or a review accepts any page shared
  with your Notion integration.
- The integration needs capabilities for each feature: **Read content** to import, **Update content** to set
  properties, **Insert content** to create pages, **Read comments** and **Insert comments** for the tab, and **Read
  user information** to pick people in rules and to tag them in a comment. Without one, Union says which to turn on.
- Comments are discussions: **Reply** answers in the discussion. Comments appear under your integration's name.
  Type `@` in a comment to tag a member of the workspace; Notion notifies them.
- A select can take a new option, which Notion creates; a status only takes its own options.
- Rules set the page's properties. Union reads the database's columns when you connect, and again with **Refresh
  from Notion** above the rules.

### Jira

- A project imports from one **Jira project** of your Jira Cloud site. Linking a ticket takes an issue of that
  project; linking a review takes any issue of the site your account can see.
- Union acts as the Atlassian account of the connection, with its permissions: **Edit issues**, **Transition
  issues**, **Add comments**.
- Comments have no threads: **Reply** posts a new comment that mentions its author, so Jira notifies them. Type
  `@` in a comment to tag anyone who can see the issue.
- The status moves through the transitions the issue's workflow offers, as Jira's own status button does.
- Rules can also move the issue to a status and comment on it. Picked fields (people, versions, components) and
  sprints come from Jira's lists; **The active sprint** and **The next sprint** are the board's when the rule runs.
  Union reads the project's statuses and fields when you connect, and again with **Refresh from Jira**.
