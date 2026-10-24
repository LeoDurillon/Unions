# Preview environments

A preview runs a ticket's branch with your repository's own Docker Compose file, so you can try the change in your
browser before you approve it, database and all.

## Set it up

Open the project's **Settings → Previews → Services**:

1. **Compose file**: the path of the Compose file in the repository, for example `compose.yaml`.
2. **Exposed services**: the services you want to open in the browser, with their port. The first one is the one
   **Open** goes to. Give the others a prefix (`api`, `admin`) to tell their addresses apart.
3. Optional: **Profiles** to enable, and **compose additions**: YAML merged over the repository's file, for what
   Union adds without changing the repository (a database restore, migrations, a seed).

Then, in **Settings → Previews → Variables**, add the environment variables the services need. Values can use
templates such as `{service.api.url}`, the address of another service. Secret values are kept on the server and
never shown again in the browser. You can also have the variables written as a file inside one service.

## Run a preview

In the ticket's **Preview** tab, click **Start preview**. Union runs it from the ticket's workspace, the agent's own
working copy, and serves each exposed service at an address of its own:

| Service           | Address                                     |
| ----------------- | ------------------------------------------- |
| The first one     | `http://t<ticket>.union.localhost:8080`     |
| One with a prefix | `http://api-t<ticket>.union.localhost:8080` |

The tab shows the services' output. The sidebar's **Previews** entry lists every preview running, across projects,
with **Stop**.

- Each ticket's preview is its own Compose project, with its own containers, network and volumes.
- Previews answer on this machine only.
- A preview nobody visited for an hour stops by itself (**Settings → Previews → Limits** changes the delay, or turns
  it off), except while the agent works on the ticket or its end-to-end tests run.
- At most 3 previews run at once (`UNION_MAX_PREVIEWS`); a project can allow fewer.

Union checks the Compose file before it runs anything and refuses settings that would reach outside the preview:
privileged containers, the host network, the Docker socket, mounts outside the repository, and external volumes.

## End-to-end tests

Set the command in **Settings → Previews → End-to-end tests**, for example `npx playwright test`. Then click **Run
e2e tests** in a ticket's Preview tab. The tests run in the ticket's container, against the running preview; the
browser they need is installed on first use, at your repository's Playwright version.

Commands there get `BASE_URL` and one `UNION_URL_<SERVICE>` variable per exposed service.

A failure can be sent to the implementer as a revision. With **Start the preview for implementation steps**, the
preview also starts before each implementation run, and the agent is told to run the end-to-end tests its change
touches.

E2e tests take a lot of memory, so they only run when you ask, one ticket at a time.

## Commands and scripts

The Preview tab's **Commands** runs a command in the ticket's workspace, as the agent would: in its checkout, with
its services and variables. Use it to run a migration, a seed or one test. You see its output live. A command:

- cannot run while a step runs, and one runs at a time per ticket;
- stops after 10 minutes by default (30 at most), or when you cancel it;
- can be kept for the implementer's next run, or sent now as a revision with a note.

Save the commands you run often in **Settings → Scripts**: each becomes a button in the Preview tab.

## Services for the agent

The agent can use your Compose services while it works, for example a database for its tests. Choose them in
**Settings → Previews → Services** (**Start for the agent**). They start before the implementation or a rebase, and
stop after it.

The ports they publish are forwarded to `localhost` in the ticket's container, so settings such as
`DATABASE_URL=postgres://localhost:5432/test` work unchanged. If your settings use service names (`db:5432`)
instead, turn **Reach them on localhost** off.

Choose which plain variables the agent's commands get (all, none, or a list). Secret variables never reach the
agent.

## Project files

**Settings → Files** holds files that every ticket's workspace gets at a path of your choice: a database dump for
the preview's seed, a local config file. Union puts them in place before each step and preview, keeps them out of
git, and refuses to push them. They cannot be read back from the browser.

## Previews of pull requests under review

A pull request you [review in Union](reviewing.md#review-other-peoples-pull-requests) has a **Preview** tab too.
Union checks out the exact commit you are reviewing in a container of its own and runs it the same way, at
`http://r<review>.union.localhost:8080`. No agent runs and nothing is written to GitHub.

- A pull request from a fork never gets the project's secret variables. Another one gets them only when its commit
  is on a branch of the repository itself.
- When the review moves to a newer commit, **Update to the reviewed commit** replaces the checkout.
- An output or an e2e result can be **added to the review** as a comment.
