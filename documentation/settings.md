# Settings reference

## Project settings

Open a project's **Settings** in the project bar. Most pages have one **Save** at the bottom.

| Group             | Page             | What it holds                                                                                                                                 |
| ----------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**       | General          | GitHub access (token or GitHub App installation) and the base branch.                                                                         |
|                   | Files            | [Project files](previews.md#project-files) every workspace gets, kept out of git.                                                             |
| **Agents**        | Instructions     | [Notes every agent of the project reads](agents.md#project-instructions).                                                                     |
|                   | Memory           | [Feedback and lessons](agents.md#memory).                                                                                                     |
|                   | Checks           | Install command, check command, iteration limit. See [Your first project](first-project.md#tell-the-agents-how-to-build-and-check-your-code). |
|                   | Scripts          | Commands you run by name from a ticket's Preview tab.                                                                                         |
|                   | Flows            | [Flow presets](tickets.md#flows) and the default one.                                                                                         |
| **Pull requests** | Pull requests    | Open a draft pull request automatically; split pull requests into stacks; check every slice.                                                  |
|                   | Review           | Hide lock files and other paths from the review page.                                                                                         |
| **Previews**      | Services         | Compose file, exposed services, compose additions, profiles, services for the agent.                                                          |
|                   | Variables        | Plain and secret environment variables for previews and the agent.                                                                            |
|                   | End-to-end tests | The e2e command, and starting the preview for implementation steps.                                                                           |
|                   | Limits           | Previews running at once, and the idle time after which a preview stops.                                                                      |
| **Integrations**  | Notion           | The Notion integration secret and data source.                                                                                                |
| **Events**        | Rules, Activity  | [Event rules](automation.md#event-rules) and what they did.                                                                                   |
|                   | Danger zone      | Delete the project. Type the repository's name to confirm.                                                                                    |

Deleting a project removes its tickets from Union, with their containers and volumes. Nothing is deleted on GitHub.

## Union settings

**Union settings**, at the bottom of the sidebar, holds what every project shares:

| Group          | Pages                                                       |
| -------------- | ----------------------------------------------------------- |
| General        | Shared instructions, Models                                 |
| Planning       | Intake, Summary, Technical, Test plan                       |
| Implementation | Implementation, Final review                                |
| Pull requests  | PR description, Rebase, Simplify history, Split plan, Split |
| Review         | Review comments, Group by spec, Explain                     |
| Memory         | Lesson writer                                               |
| Custom agents  | Your own agents, and **New agent**                          |
| Tools          | Tools, Connectors                                           |
| GitHub         | GitHub App                                                  |

See [Agents, flows and memory](agents.md) for what each page does.

## Environment variables

All are optional. Put them in a `.env` file at the root of Union's checkout: Bun reads it when Union starts, with or
without Compose. Under Compose, variables set in your shell do not reach Union, except `GITHUB_TOKEN` and the ones
`compose.yaml` itself reads (ports, user and group ids).

| Variable                    | Default                        | Purpose                                                                    |
| --------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `GITHUB_TOKEN`              | none                           | Token for projects that have no GitHub access of their own                 |
| `UNION_MAX_CONCURRENT`      | `2`                            | Agent runs at the same time, tickets and investigations                    |
| `UNION_MAX_PREVIEWS`        | `3`                            | Previews running at the same time, across projects                         |
| `UNION_GITHUB_PULL_MS`      | `30000`                        | How often Union reads the changes made on GitHub                           |
| `DB_PATH`                   | `union.sqlite` in the checkout | The database file                                                          |
| `UNION_ATTACHMENTS_DIR`     | `attachments/` in the checkout | Where ticket and preview files are kept                                    |
| `UNION_MAX_PROJECT_FILE_MB` | `2048`                         | The largest project file                                                   |
| `UNION_CLAUDE_CREDENTIALS`  | `~/.claude/.credentials.json`  | The Claude login given to the agents (set by `compose.yaml` under Compose) |
| `UNION_AGENT_IMAGE`         | `union-agent:local`            | The image agents run in                                                    |

Read by `compose.yaml`:

| Variable                 | Default  | Purpose                                    |
| ------------------------ | -------- | ------------------------------------------ |
| `UNION_WEB_PORT`         | `5173`   | Union's port                               |
| `UNION_PREVIEW_PORT`     | `8080`   | The preview proxy's port                   |
| `UNION_UID`, `UNION_GID` | `1000`   | The user and group Union runs as           |
| `DOCKER_GID`             | `1001`   | The group that owns `/var/run/docker.sock` |
| `UNION_SSH_DIR`          | `~/.ssh` | SSH keys used to fetch Union's own updates |
