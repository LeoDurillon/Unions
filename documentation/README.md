# Union user guide

Union is a Kanban board that runs on your own machine, on top of a GitHub Project. You write a ticket and move it to
**In progress**. Claude Code agents then plan the change with you, implement it until your checks pass, and open a
pull request. A second agent reviews that pull request before you do.

This guide explains how to install Union and use it day to day. To work on Union's own code, read
[`AGENTS.md`](../AGENTS.md) and the design notes in [`docs/`](../docs/spec/README.md) instead.

![The board](../docs/screenshots/board.png)

## Get started

1. [Installation](installation.md): what you need, and how to start Union.
2. [Your first project](first-project.md): connect GitHub, pick a repository, and set the commands the agents run.

## Daily use

- [The board and tickets](tickets.md): write, import and organize tickets, choose a flow, and set dependencies.
- [From ticket to pull request](ticket-lifecycle.md): planning, implementation and final review, and what to do
  when a step stops.
- [Reviewing changes](reviewing.md): the diff, line comments, Explain, agent reviews, and other people's pull
  requests.
- [Branches and pull requests](branches.md): CI checks, rebase, change of target, simplified history, and stacks of
  pull requests.
- [Preview environments](previews.md): run a branch with Docker Compose, run end-to-end tests and commands.
- [Investigations](investigations.md): ask an agent a one-off question about your code or anything else.

## Make it yours

- [Agents, flows and memory](agents.md): prompts, models, tools, custom agents, project instructions and lessons.
- [Automation and notifications](automation.md): event rules for Notion and GitHub, and notifications.
- [Settings reference](settings.md): every page of the project settings and Union settings, and the environment
  variables.

## Run it

- [Updating, backups and data](maintenance.md): updates, database backups, and what Union stores where.
- [Troubleshooting](troubleshooting.md): common problems and how to fix them.
- [How Union works](how-it-works.md): processes, containers, credentials, and what each run costs.

## Words used in this guide

| Word              | Meaning                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| **Project**       | One repository and the GitHub Project its board mirrors.                                              |
| **Ticket**        | One change to make. It has a GitHub issue, and later a branch and a pull request.                     |
| **Step**          | One agent's turn on a ticket: Intake, Summary, Technical, Test plan, Implementation, Final review…    |
| **Flow**          | The steps a ticket runs, in order.                                                                    |
| **Run**           | One agent execution. A step can take several runs when you ask for revisions.                         |
| **Workspace**     | The ticket's copy of the repository, inside its own Docker volume.                                    |
| **Investigation** | A one-off agent run on a question of yours, with no ticket and nothing posted to GitHub.              |
| **Lesson**        | A rule you keep for one step of a project's agents, often written from feedback you gave on a ticket. |
