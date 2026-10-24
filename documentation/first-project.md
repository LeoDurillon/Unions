# Your first project

A project is one GitHub repository and the GitHub Project its board mirrors. The setup wizard opens the first time
you visit Union. Later, open it again from **+** next to **Projects** in the sidebar.

## The setup wizard

1. **Connect**: paste a GitHub token and click **Verify**, or switch to **GitHub App** (see below).
2. **Repository**: pick the repository the agents work on.
3. **Project**: pick an existing GitHub Project, or let Union create one.
4. **Notion** (optional): an integration secret and the ID of the data source to import tickets from.
5. **Review**: check the base branch (the branch tickets start from and pull requests target), then create the
   project.

The board opens. Union mirrors its columns to the Project's **Status** field, to the options **Todo**, **In
Progress**, **In Review** and **Done** (in any case). A Project made from GitHub's default template has no In Review:
tickets in review then show as In Progress on GitHub.

## Connect GitHub

Union needs to read and write issues, comments, branches and pull requests, and to move items on the Project
board. Pick one of three kinds of access:

| Access             | When to use it                                    | What it needs                                                                                                                           |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Fine-grained token | A repository and Project owned by an organization | Resource owner: the organization. Repository: Contents, Issues, Pull requests (read and write). Organization: Projects (read and write) |
| Classic token      | A Project owned by a **user** account             | Scopes `repo` and `project`                                                                                                             |
| GitHub App         | An organization, with actions signed by the app   | Set up from Union, see below                                                                                                            |

Fine-grained tokens and GitHub Apps cannot reach a Project that belongs to a user account: use a classic token for
those.

If you set `GITHUB_TOKEN` in Union's environment, projects with no access of their own use it.

### Use a GitHub App

With an app, issues, comments and pull requests are signed by the app instead of by you, and its tokens expire after
an hour.

1. Open **Union settings → GitHub App**, enter the organization, and click **Create the GitHub App**. GitHub opens
   with the permissions filled in.
2. Create the app on GitHub, then paste its **App ID** and the private key (`.pem`) it generates into Union.
3. Install the app on the organization.
4. Pick that installation in the wizard, or in the project's **Settings → General**.

The app also asks for read access to Checks and Commit statuses, and read and write access to Actions, so Union can
show your pull requests' CI checks and re-run failed jobs. When an app you installed earlier asks for new
permissions, accept them on GitHub before they apply.

## Tell the agents how to build and check your code

Open the project's **Settings → Checks** before you start a ticket:

- **Install command**: run in the ticket's workspace before the agent works, for example `bun install` or
  `npm ci`.
- **Check command**: what "done" means, for example `bun run check` or `npm test && npm run lint`. The
  implementation agent runs it, fixes what fails, and runs it again.
- **Iteration limit**: how many times the agent may go back to fix failing checks before the step stops (3 by
  default).

The agents run inside a Linux container with Bun, git and the Claude Code CLI. If your project needs other tools
(another language's toolchain, a database for its tests), see [Preview environments](previews.md#services-for-the-agent)
for databases and other services, or add the tools to `docker/agent.Dockerfile` and rebuild the image.

## Optional, but worth a look

- **Settings → Instructions**: notes every agent of this project reads, such as conventions, where things are, and
  what never to touch. See [Agents, flows and memory](agents.md#project-instructions).
- **Settings → Flows**: which planning steps a ticket runs by default. See
  [The board and tickets](tickets.md#flows).
- **Settings → Pull requests**: open a draft pull request automatically after the implementation (on by default).

Next: [The board and tickets](tickets.md).
