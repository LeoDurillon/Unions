# Settings reference

## Project settings

Open a project's **Settings** in the project bar. Most pages have one **Save** at the bottom. **Learn more**, under
the page's name, opens the part of this guide about it; Union settings pages have it too.

| Group             | Page             | What it holds                                                                                                                                      |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**       | General          | GitHub access (token or GitHub App installation), the base branch, and whether tickets get GitHub issues.                                          |
|                   | Files            | [Project files](previews.md#project-files) every workspace gets, kept out of git.                                                                  |
| **Agents**        | Instructions     | [Notes every agent of the project reads](agents.md#project-instructions).                                                                          |
|                   | Memory           | [Feedback and lessons](agents.md#memory).                                                                                                          |
|                   | Checks           | Install command, check command, iteration limit. See [Your first project](first-project.md#tell-the-agents-how-to-build-and-check-your-code).      |
|                   | Change size      | The budget of a ticket without an estimate, and the paths that are not code. See [The size of a change](ticket-lifecycle.md#the-size-of-a-change). |
|                   | Scripts          | Commands you run by name from a ticket's Preview tab.                                                                                              |
|                   | Flows            | [Flow presets](tickets.md#flows) and the default one.                                                                                              |
|                   | Agent image      | [The image the project's agents run in](agents.md#the-agent-image): the default, your own Dockerfile, or an image you built.                       |
| **Pull requests** | Pull requests    | Open a draft pull request automatically; suggest replies to GitHub comments; split pull requests into stacks; check every slice.                   |
|                   | Review           | Hide lock files and other paths from the review page.                                                                                              |
| **Previews**      | Services         | Compose file, exposed services, compose additions, profiles, services for the agent.                                                               |
|                   | Variables        | Plain and secret environment variables for previews and the agent, and a file to write them to for apps that read one.                             |
|                   | End-to-end tests | The e2e command, and starting the preview for implementation steps.                                                                                |
|                   | Limits           | Previews running at once, and the idle time after which a preview stops.                                                                           |
| **Integrations**  | GitHub Project   | The GitHub Project the board mirrors to: connect one (pick or create), change it or disconnect it.                                                 |
|                   | Notion           | The Notion integration secret and data source.                                                                                                     |
|                   | Jira             | The Jira site, account email, API token, project key and the issue type of new issues ([Connect Jira](first-project.md#connect-jira)).             |
| **Events**        | Rules, Activity  | [Event rules](automation.md#event-rules) and what they did.                                                                                        |
|                   | Danger zone      | Delete the project. Type the repository's name to confirm.                                                                                         |

Deleting a project removes its tickets from Union, with their containers and volumes. Nothing is deleted on GitHub.

### GitHub issues and the GitHub Project

- **General → Mirror tickets as GitHub issues** (on by default): each ticket gets a GitHub issue with a comment per
  step, and its pull request closes it. Turn it off when the team works in Notion or Jira, so tickets are not copied
  a second time: a ticket written in Union or imported from a tracker then gets no issue, its step outputs stay in
  Union, and reviewers read the agent's summary in the pull request. A ticket imported from a GitHub issue keeps it.
  Turning it back on opens the missing issues. It stays on while a GitHub Project is connected.
- **Integrations → GitHub Project**: pick one of the repository owner's Projects, or create one, and click
  **Connect**; each ticket's issue is added to it as a card that follows the ticket's column, and moving a card to
  In Progress on GitHub starts the ticket. **Change** moves the tickets to another Project. **Disconnect** stops
  updating it; the Project and its cards stay on GitHub as they are. Without a Project, Union's board is the only
  board.

## Union settings

**Union settings**, at the bottom of the sidebar, holds what every project shares:

| Group          | Pages                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| General        | Shared instructions, Models                                                                          |
| Planning       | Intake, Summary, Technical, Test plan                                                                |
| Implementation | Implementation, Trim, Final review                                                                   |
| Pull requests  | PR description, Replies to GitHub comments, Rebase, Simplify history, Split plan, Split into a stack |
| Review         | Review comments, Group by spec, Explain, Spec report                                                 |
| Memory         | Lesson writer, Lesson tidier                                                                         |
| Custom agents  | Your own agents, and **New agent**                                                                   |
| Review agents  | Your own review agents, run from a review page                                                       |
| Tools          | Tools, Connectors                                                                                    |
| GitHub         | GitHub App                                                                                           |

See [Agents, flows and memory](agents.md) for what each page does.

## Environment variables

All are optional. Put them in a `.env` file at the root of Union's checkout: Bun reads it when Union starts, with or
without Compose. Under Compose, variables set in your shell do not reach Union, except `GITHUB_TOKEN` and the ones
`compose.yaml` itself reads (ports, user and group ids).

| Variable                    | Default                        | Purpose                                                                                                          |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`              | none                           | Token for projects that have no GitHub access of their own                                                       |
| `UNION_MAX_CONCURRENT`      | `2`                            | Agent runs at the same time, tickets and investigations                                                          |
| `UNION_MAX_PREVIEWS`        | `3`                            | Previews running at the same time, across projects                                                               |
| `UNION_GITHUB_PULL_MS`      | `30000`                        | How often Union reads the changes made on GitHub                                                                 |
| `DB_PATH`                   | `union.sqlite` in the checkout | The database file                                                                                                |
| `UNION_ATTACHMENTS_DIR`     | `attachments/` in the checkout | Where ticket and preview files are kept                                                                          |
| `UNION_MAX_PROJECT_FILE_MB` | `2048`                         | The largest project file                                                                                         |
| `UNION_CLAUDE_CREDENTIALS`  | `~/.claude/.credentials.json`  | The Claude login given to the agents (set by `compose.yaml` under Compose)                                       |
| `UNION_AGENT_IMAGE`         | `union-agent:local`            | The image agents run in, and `FROM union-agent` in a project's Dockerfile                                        |
| `UNION_AGENT_BASE_IMAGE`    | `union-agent-base:local`       | The minimal image: `FROM union-agent-base` in a project's Dockerfile                                             |
| `UNION_ALLOWED_HOSTS`       | none                           | Host names Union answers to besides `localhost` and `127.0.0.1`, for both the page and the API (comma-separated) |
| `UNION_GIT_BASE_URL`        | `https://github.com`           | Where agents clone the repositories from                                                                         |
| `PORT`                      | `3000`                         | Union's port with `bun run start`                                                                                |
| `UNION_HOST`                | `127.0.0.1`                    | The address Union listens on with `bun run start`                                                                |

Read by `compose.yaml`:

| Variable                 | Default  | Purpose                                                               |
| ------------------------ | -------- | --------------------------------------------------------------------- |
| `UNION_WEB_PORT`         | `5173`   | Union's port                                                          |
| `UNION_PREVIEW_PORT`     | `8080`   | The preview proxy's port (read by Union too, for the previews' links) |
| `UNION_UID`, `UNION_GID` | `1000`   | The user and group Union runs as                                      |
| `DOCKER_GID`             | `1001`   | The group that owns `/var/run/docker.sock`                            |
| `UNION_SSH_DIR`          | `~/.ssh` | SSH keys used to fetch Union's own updates                            |
