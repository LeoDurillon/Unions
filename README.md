# union-next

A local Kanban board over a GitHub Project where Claude agents do the work.

You write a ticket, drag it to **In Progress**, and Union starts a Docker container for it. Inside, Claude Code (on
your Claude Max subscription) works through a pipeline on a clone of the project's repository:

1. **Planning**: intake (clarifying questions you answer inline), summary, technical plan, test plan. Each step is
   a tab on the ticket; you **Approve** it or **Revise** it with feedback.
2. **Implementation**: after the test plan is approved, the agent writes the code and runs the project's checks
   until they pass. The host pushes the branch and opens a draft pull request.
3. **Final review**: a separate agent reviews the branch against the plan. You can also review the diff in Union,
   comment on lines and send the comments back to the implementer. Approving marks the PR ready for review.

A ticket can depend on another one: it waits until that ticket is Done, then starts from its branch, and its
pull request targets that branch.

Everything is mirrored to GitHub: one issue per ticket, one comment per step, the ticket's column on the GitHub
Project board, and "blocked by" between the issues of linked tickets. Tickets can also be imported from a Notion
database. Each ticket keeps its own container and volumes, so work survives between steps, and several tickets can
run in parallel.

The app runs on your machine only. Credentials (GitHub token or App key, Notion secret) stay in a local SQLite
database and never reach the agent containers: the host does every clone, push and GitHub call.

See [SPEC.md](SPEC.md) for the design and [AGENTS.md](AGENTS.md) for working on the code.

## Requirements

- Linux or WSL2 with **Docker** (Compose v2). The worker starts agent containers through the Docker socket.
- **Claude Code** logged in on the host with your Claude Max account: Union seeds each container with the
  credential from `~/.claude/.credentials.json`. Run `claude` once and log in if that file does not exist.
- A **GitHub** repository with a GitHub Project (or let the setup wizard create one), and one of:
  - a **fine-grained token** for an organization repository: resource owner = the organization; repository
    permissions Contents, Issues and Pull requests read and write; organization permission Projects read and write;
  - a **classic token** with the `repo` and `project` scopes (required when the Project belongs to a user
    account rather than an organization);
  - a **GitHub App** installed on the organization (set up from the app; see below).
- Optional: a **Notion** internal integration to import tickets.
- To run without Docker Compose: **Bun 1.4.1** and git on the host.

## Installation

```sh
git clone <this repository> union-next
cd union-next
bun run compose        # or: docker compose up --build
```

The first start installs the dependencies, builds the agent image (`union-agent:local`), then starts the web app and
the worker. Open <http://localhost:5173>.

If the worker cannot reach Docker, set the group of the Docker socket (and your user id if it is not 1000) in a
`.env` file next to `compose.yaml`:

```sh
echo "DOCKER_GID=$(stat -c %g /var/run/docker.sock)" >> .env
echo "UNION_UID=$(id -u)" >> .env
echo "UNION_GID=$(id -g)" >> .env
```

Stop the stack with `bun run compose:down`, follow logs with `bun run compose:logs`.

### Without Docker Compose

```sh
bun install
docker build -t union-agent:local -f docker/agent.Dockerfile docker
bun run dev            # web on http://localhost:5173 and the worker, with reload
```

`bun run start` builds the client and runs the production server on <http://localhost:3000> with the worker.

## First project

The setup wizard opens on first run (later: **+ Add project** in the sidebar):

1. **Connect**: paste a token and click **Verify**, or switch to **GitHub App**.
2. **Repository**: pick the repository the agents work on.
3. **Project**: pick an existing GitHub Project or create one.
4. **Notion** (optional): integration secret and data source ID.
5. **Review**: check the base branch and create the project.

Then open the project's **Settings** to set the install and check commands (for example `bun install` and
`bun run check`): the implementation step loops on the check command until it passes.

### Using a GitHub App instead of a token

Open **GitHub App** in the sidebar, enter the organization and click **Create the GitHub App**: GitHub opens with the
permissions filled in. Paste the App ID and the generated private key (`.pem`) into Union, install the app on the
organization, then pick that installation in the wizard or in the project's **Settings → General**. Issues, comments
and pull requests are then authored by the app. Apps cannot reach Projects owned by a user account; use a classic
token for those.

## Configuration

Environment variables (shell or `.env`), all optional:

| Variable                   | Default                               | Purpose                                                  |
| -------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `GITHUB_TOKEN`             | none                                  | Token for projects that have no credentials of their own |
| `UNION_MAX_CONCURRENT`     | `2`                                   | Agent runs at the same time (Max usage limits apply)     |
| `UNION_GITHUB_PULL_MS`     | `30000`                               | How often changes made on GitHub are pulled              |
| `UNION_WEB_PORT`           | `5173`                                | Port of the web app (Compose)                            |
| `DB_PATH`                  | `union.sqlite` at the repository root | Database file shared by web and worker                   |
| `UNION_CLAUDE_CREDENTIALS` | `~/.claude/.credentials.json`         | Claude credential seeded into containers                 |
| `UNION_AGENT_IMAGE`        | `union-agent:local`                   | Image agent containers run from                          |

Agent prompts, models and allowed tools are edited in **Agent settings** in the sidebar and stored in the
database.

## Database

All state is in `union.sqlite` at the repository root.

- `bun run db:backup [file]`: consistent copy into `backups/`, safe while the app runs.
- `bun run db:restore <file>`: restores a backup (stop the app first; the current database is saved).
- `bun run db:reset --yes`: empty database, and removes the agent containers of the deleted tickets. GitHub and Notion
  are not touched.

## Development

`bun run check` runs formatting, lint, type checking and tests; it must pass before committing. See
[AGENTS.md](AGENTS.md) for the layout and the rules.
