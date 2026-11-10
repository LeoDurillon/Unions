# Your first project

A project is one GitHub repository, and optionally a GitHub Project its board mirrors. The setup wizard opens the first time
you visit Union. Later, open it again from **+** next to **Projects** in the sidebar.

## The setup wizard

1. **Connect**: paste a GitHub token and click **Verify**, or switch to **GitHub App** (see below).
2. **Repository**: pick the repository the agents work on.
3. **Integrations** (optional): pick **GitHub Project**, **Notion** or **Jira** at the top to set it up; you can
   set up all of them, or none. One you set up shows a ✓. To skip a tracker, leave its fields empty; Next waits
   until each one you filled in is verified.
   - **GitHub Project**: **No GitHub Project** (the default), an existing Project, or **Create a new project**.
     With a Project, each ticket's issue is a card on it. Without one, Union's board is the only board; you can
     connect one later in **Settings → Integrations → GitHub Project**. A token without the `project` scope works
     for a project with none.
   - **Notion**: an integration secret and the ID of the data source to import tickets from. The integration
     needs the capabilities listed in [Installation](installation.md).
   - **Jira**: your Jira site, the email of your Atlassian account, an API token and the key of the project to
     import tickets from. See [Connect Jira](#connect-jira).
4. **Review**: check the base branch (the branch tickets start from and pull requests target). To have an agent
   set up the project for you, turn on **Let an agent set up this project** and pick its model (Sonnet by default).
   See [Let an agent set up the project](#let-an-agent-set-up-the-project). Then create the project.

The board opens, with a **Getting started** list above it: set the check command, write a ticket, start it,
answer the planning, and review the change. Each step ticks itself once you have done it. **Open Checks** and
**New ticket** take you to the first two; each step's **Learn more** opens its part of this guide. The list goes away when every step is done; **Hide** removes it sooner, for this project in this browser.
To see it again, click **Help** at the bottom of the sidebar, then **Getting started**.

With a GitHub Project, Union mirrors its columns to the Project's **Status** field, to the options **Todo**, **In
Progress**, **In Review** and **Done** (in any case). A Project made from GitHub's default template has no In Review:
tickets in review then show as In Progress on GitHub.

## Connect GitHub

Union needs to read and write issues, comments, branches and pull requests, and, with a GitHub Project, to move
items on its board. Pick one of three kinds of access:

| Access             | When to use it                                    | What it needs                                                                                                                           |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Fine-grained token | A repository and Project owned by an organization | Resource owner: the organization. Repository: Contents, Issues, Pull requests (read and write). Organization: Projects (read and write) |
| Classic token      | A Project owned by a **user** account             | Scope `repo`, and `project` for a GitHub Project                                                                                        |
| GitHub App         | An organization, with actions signed by the app   | Set up from Union, see below                                                                                                            |

To show your pull requests' CI checks, a token also needs read access to Checks, Commit statuses and Actions
(the `repo` scope covers them for a classic token); to re-run failed jobs, write access to Actions.

Fine-grained tokens and GitHub Apps cannot reach a Project that belongs to a user account: use a classic token for
those, or set the project up with no GitHub Project. Without one, no Projects permission or `project` scope is needed.

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

## Connect Jira

Union imports Jira Cloud issues as tickets (Jira Data Center and Server are not supported). It acts in Jira as your
Atlassian account, with an API token: it reads the project's issues, and moves, comments on or creates them only
when your rules, comments or investigations ask it to.

1. Open [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens) and
   click **Create API token** (not the one with scopes). Copy it.
2. In the wizard's **Integrations** step (pick **Jira**), or later in the project's settings under **Integrations → Jira**, fill in:
   - **Site**: the address you open Jira at, `https://<name>.atlassian.net` (the name alone works too);
   - **Account email**: the email of the Atlassian account the token belongs to;
   - **API token**: the token you copied;
   - **Project key**: the letters before an issue's number, `ABC` for `ABC-123`.
3. Click **Verify** (in the settings, **Verify and save**). Union shows the project's name when Jira accepts them.
4. Optionally, in the settings, pick the **Issue type for new issues**: the type of the issues an investigation
   creates with **Also create it in Jira** (see [Investigations](investigations.md)). By default, Task, or the
   project's first type.

Your account must be able to see the project's issues. The token stays on this machine; to stop, click
**Disconnect** in the settings.

## Let an agent set up the project

With **Let an agent set up this project** on in the wizard, an agent reads your repository once the project is
created: its README, package scripts, compose files, CI workflows, env examples and test configs, along with this
guide, to see how Union uses each setting. It proposes the install and
check commands, the preview, the e2e command, saved scripts, project instructions and, when your code needs a
toolchain the default image lacks, an agent image. It also lists the secrets and files you must add yourself, and
any repository changes the setup needs. It only reads: it changes nothing in your repository or your settings.
It runs on your Claude subscription.

A **Project setup** card above the board follows the run. **Follow its log** shows what the agent is doing. Once it
has answered, **Read its answer** opens its proposal on the Investigations tab. Fill in the settings it proposes in
**Settings**; applying a proposal in one click is coming. If the run failed (for example, Claude is not logged in
on this machine) or was cancelled, the card says why: pick a model and click **Run setup** to try again.

## Tell the agents how to build and check your code

Open the project's **Settings → Checks** before you start a ticket:

- **Install command**: run in the ticket's workspace before the agent works, for example `bun install` or
  `npm ci`.
- **Check command**: what "done" means, for example `bun run check` or `npm test && npm run lint`. The
  implementation agent runs it, fixes what fails, and runs it again.
- The ticket's checkout is a full clone of the repository: `origin/<base branch>` is the base branch as it was
  when the ticket's container was created, so a command can compare against it (`git diff origin/main...`).
- **Iteration limit**: how many times the agent may go back to fix failing checks before the step stops (3 by
  default).

The agents run inside a Linux container with Node, Bun, pnpm, yarn, git and the Claude Code CLI. If your project needs
other tools (another language's toolchain, a database for its tests), see
[Preview environments](previews.md#services-for-the-agent) for databases and other services, or give the project
[its own agent image](agents.md#the-agent-image).

## Optional, but worth a look

- **Settings → Instructions**: notes every agent of this project reads, such as conventions, where things are, and
  what never to touch. See [Agents, flows and memory](agents.md#project-instructions).
- **Settings → Flows**: which planning steps a ticket runs by default. See
  [The board and tickets](tickets.md#flows).
- **Settings → Pull requests**: open a draft pull request automatically after the implementation (on by default).

Next: [The board and tickets](tickets.md).
