# Preview environments

A preview runs a ticket's branch with your repository's own Docker Compose file, so you can try the change in your
browser before you approve it, database and all.

## Set it up

Open the project's **Environments** tab, in the bar above the board, and its **Services** page. The tab also lists
the project's previews running now, with their addresses and **Stop**.

1. **Compose file**: the path of the Compose file in the repository, for example `compose.yaml`.
2. **Exposed services**: the services you want to open in the browser, with their port. The first one is the one
   **Open** goes to. Give the others a prefix (`api`, `admin`) to tell their addresses apart.
3. Optional: **Profiles** to enable, and **compose additions**: YAML merged over the repository's file, for what
   Union adds without changing the repository (a database restore, migrations, a seed).

Then, in **Environments → Variables**, add the environment variables the services need. Values can use
templates such as `{service.api.url}`, the address of another service. Secret values are kept on the server and
never shown again in the browser. You can also have the variables written as a file inside one service.

## Run a preview

In the ticket's **Preview** tab, click **Start preview**. Union runs it from the ticket's workspace, the agent's own
working copy, and serves each exposed service at an address of its own:

| Service           | Address                                     |
| ----------------- | ------------------------------------------- |
| The first one     | `http://t<ticket>.union.localhost:8080`     |
| One with a prefix | `http://api-t<ticket>.union.localhost:8080` |

While it starts, the tab counts the time and shows the build's output as it comes; **Cancel start** stops it and
removes what it had started. Once it runs, the tab shows its addresses, **Restart** and **Stop**, and the services'
output. The **⋯** menu beside the status holds the Compose file, **Reset preview…** and **Environment settings**, which opens the project's **Environments** tab. The
sidebar's **Previews** entry lists every preview running, across projects, with **Stop**.

- Each ticket's preview is its own Compose project, with its own containers, network and volumes.
- Previews answer on this machine only.
- When a service the preview serves stops on its own (it crashed, or was killed), the preview shows **Failed**
  within a minute, with which service stopped and the services' last output. Its other containers are removed (left
  running while the agent works on the ticket, which uses them); click **Start preview** to bring it back with its
  data, which stays in its volumes and the ticket's workspace. The ticket's Log says when it happened.
- A preview nobody visited for an hour stops by itself (**Environments → Limits** changes the delay, or turns
  it off), except while the agent works on the ticket or its end-to-end tests run.
- Once the ticket's pull request is merged, or the ticket is cancelled, its preview is removed for good, with its
  data and the images it built.
- At most 3 previews run at once (`UNION_MAX_PREVIEWS`); a project can allow fewer.

### Edit the Compose file for one ticket

**Compose file** in the **⋯** menu shows the file the preview runs: the repository's, with what Union adds.
**Generate** (or **Generate again**) reads it from the branch without starting anything. To try a change on this
ticket only, edit it and click **Save as this ticket's file**: the menu then reads **Compose file (yours)**, and
**Start** and **Restart** run your version as it is, ignoring changes the branch makes to the Compose file. **Use
the generated file again** goes back. Your file is checked like the generated one (see below), and changes apply at
the next Start or Restart. A pull request's preview has the same menu.

### Start over with a fresh preview

**Restart** updates a running preview in place: its data, such as its database, is kept. When that data is broken (a
failed migration, a bad seed), choose **Reset preview…** in the **⋯** menu and confirm. Union removes the preview's containers, its
volumes (its databases, and those of the agent's services) and the images it built, builds them again from scratch,
and starts the preview. The code in the ticket's workspace is kept. The ticket's Log says when a reset happened.

Some Compose files keep data in a folder of the repository (`./data:/var/lib/postgresql/data`) rather than in a
volume. When git ignores such a folder and it holds no tracked file, the confirmation offers **Also empty
`data/`**: tick it to empty that folder too. Union finds these folders each time the preview starts, so start the
preview once before you reset it.

You can't reset while the agent works on the ticket (it uses the same services), while the end-to-end tests run, or
while a command runs. A pull request's preview has the same button.

Union checks the Compose file before it runs anything and refuses settings that would reach outside the preview:
privileged containers, the host network, the Docker socket, mounts outside the repository, and external volumes.
It also refuses a service built under the name of an image Union itself runs (`union-…`, `docker`, `traefik`,
`oven/bun`, `node`, `debian`), and volumes or networks named `union-…`: give your built images and volumes your own
names, or leave them unnamed.

## End-to-end tests

Set the command in **Environments → End-to-end tests**, for example `npx playwright test`. It can take several
lines, for example a setup line before the tests. Then click **Run
e2e tests** in a ticket's Preview tab (**Run again** once there is a result).
The result shows how long ago it ran; open **Output** for its last lines, or **Command** for what ran. The tests run in the ticket's container, against the running preview; the
browser they need is installed on first use, at your repository's Playwright version.

Commands there get `BASE_URL` and one `UNION_URL_<SERVICE>` variable per exposed service.

A failure can be sent to the implementer as a revision (**Send the failure to the agent**). When the preview
restarted or the agent worked on the ticket after the tests ran, the tab asks you to run them again and offers only
**Run again**: send a failure from tests run on the current code. A pull request's result can't be added to
the review in that case either. With **Start the preview for implementation steps**, the
project's install command runs and the preview starts before each implementation run, and the agent is told to run the end-to-end tests its change
touches.

E2e tests take a lot of memory, so they only run when you ask, one ticket at a time.

## Commands and scripts

The Preview tab's **Commands** runs a command in the ticket's workspace, as the agent would: in its checkout, with
its services and variables. Use it to run a migration, a seed or one test. You see its output live. A command:

- cannot run while a step runs, and one runs at a time per ticket;
- stops after 10 minutes by default (30 at most), or when you cancel it;
- can be kept for the implementer's next run, or sent now as a revision with a note.

Each command you ran is one line: its exit code, the command and how long it took. Click a line to open its output
and the buttons that keep it or send it to the agent; **↻ Again** runs it again. The newest is open, and the list shows
the last five, with **Show older** for the rest.

Save the commands you run often in **Settings → Scripts**: each becomes a button in the Preview tab.

## Services for the agent

The agent can use your Compose services while it works, for example a database for its tests. Choose them in
**Environments → Services** (**Start for the agent**). They start before the implementation or a rebase, and
stop after it.

The ports they publish are forwarded to `localhost` in the ticket's container, so settings such as
`DATABASE_URL=postgres://localhost:5432/test` work unchanged. If your settings use service names (`db:5432`)
instead, turn **Reach them on localhost** off.

Choose which plain variables the agent's commands get (all, none, or a list). Secret variables never reach the
agent.

## Services shared between previews

Some services are only utilities, such as a virus scanner or a mail catcher, and every preview can use the same one.
Choose them in **Environments → Services** (**Shared between previews**). Union then runs them once for the
whole project instead of once per preview, which saves memory: a virus scanner alone can take more than a gigabyte.

- Your previews still reach them by name (`clamav:3310`), so you don't change your Compose file or your variables.
  Previews still can't reach each other.
- They start with the first preview that needs them and stop once no preview and no agent uses them. What they
  store is kept for the next start.
- A service with data (a database) needs one more setting so that previews don't share its data: see below.
- Whichever preview starts them first decides how they run. Previews started later use them as they already are,
  even if their branch changes those services.
- They also serve the agent when you list them under **Start for the agent**, and their ports are forwarded to
  `localhost` as usual.
- A pull request from a fork runs its own copies.

### Services with data: one database per preview

A database or a file store can be shared too, as long as each preview gets its own database or bucket in it. Under
each shared service, two commands say how:

- **When a preview starts** runs in the service's container before each start of a preview, and before the agent
  uses it. It creates the preview's database if it is missing, so it must be safe to run again.
- **When a preview's data is removed** runs when the preview's data goes: **Stop**, **Reset**, a start that failed,
  and once the ticket is done or removed. Data the preview keeps over a **Restart** or a crash stays.

`{ticket.id}` names the preview in both (`41` for ticket 41, `r5` for a pull request under review). Use it in your
variables too, so the preview's services connect to their own database. For example, for Postgres:

```
psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'app_{ticket.id}'" | grep -q 1 || createdb -U postgres app_{ticket.id}
dropdb -U postgres --if-exists app_{ticket.id}
```

and `DATABASE_URL=postgres://postgres:postgres@db:5432/app_{ticket.id}` in **Environments → Variables**.

If the first command fails, the preview doesn't start and shows its output. If the service isn't running when a
preview's data is removed, that data stays in the service.

The agent's tests often name a fixed database in the repository's settings (`.env.test`). Two tickets working at the
same time would then share it. List a shared database under **Start for the agent** only if its tests use the
ticket's own database.

A service the proxy opens, one that builds its image from the repository, or one that mounts files from it can't be
shared. If you pick one, the preview won't start and says why.

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
