# Preview environments

Built (phases 1 to 4). Full design and what was built: [`docs/plans/preview-environments.md`](../plans/preview-environments.md). In short:

- A ticket's branch runs from the repository's own Docker Compose file (path set per project), so apps with a
  database or a queue work. Each ticket is its own compose project (`union-t<id>`): its own containers, network and
  volumes, no published host ports.
- It runs from the ticket's workspace volume (the agent's live working copy), through a short-lived helper
  container that holds the Docker socket; the agent's container never does. The worker resolves the file with
  `docker compose config`, refuses dangerous settings (privileged, host network, Docker socket, mounts leaving the
  repository, external volumes), turns source mounts into mounts of the workspace volume, and writes a new file with
  Traefik labels on the exposed services: `http://t<id>.union.localhost`, `http://api-t<id>.union.localhost`.
  Every preview's hosts end with `union.localhost`, so a browser files the logins it saves on one preview under the
  same site and offers them on the others.
- Per-project environment variables (secrets kept server side) with templates such as `{service.api.url}`, given to
  compose and optionally as an app env file inside a service, never written into the workspace.
- End-to-end tests: the agent's container joins the preview's network; Chromium's and Firefox's libraries are in the
  agent image, the browser is installed at the repository's Playwright version on first use. While the preview runs,
  the container also answers at the preview's public addresses (`http://api-t<id>.union.localhost:8080`): a router
  on that port sends each host to its service on the preview's network, so a browser there gets the same pages, calls
  between services and login cookies as the user's; other previews stay out of reach. Commands there (the agent's,
  the e2e tests, the user's) get `UNION_URL_<SERVICE>`, each service's public address, besides `BASE_URL`. The
  project's e2e command runs when the user asks, from the ticket ("Run e2e tests", one run at a time: they take a lot
  of memory); a failure can be sent to the agent as a revision. With "Start the preview for implementation steps"
  (Previews → End-to-end tests), the preview starts before each implementation or revision, and the agent is told
  the addresses and to run the e2e tests its work touches.
- Compose additions (project settings → Previews → Services): YAML merged over the repository's file as a second
  `-f`, for what Union adds without changing the repository (a database restore, migrations, a seed). Kept in the
  settings, written only in the compose helper.
- Project files (project settings → Project → Files): files put at a path in every ticket's repository before each
  step and preview start, kept out of git (`.git/info/exclude`) and refused in pushes, never readable from the
  browser. A database dump for the additions' restore, a local config.
- Services for the agent: chosen compose services run in the ticket's project while it implements or rebases (a
  database for its tests), and while the user runs a command from the ticket, stopped after. The ports they publish
  in the compose file are forwarded to the ticket container's `localhost` (IPv4 and IPv6), so the repository's
  laptop settings (`.env.test` with `localhost:5432`) work unchanged; the agent is told where each one answers. A
  project whose settings already use the services' names turns it off (Previews → Services, "Reach them on
  localhost"). Which
  plain variables the agent's commands get is a setting (all by default, none, or chosen): a variable already set
  wins over the repository's env files. Secrets never reach the agent.
- **Previews** (in the sidebar, with the number running): every project's previews that hold containers, tickets'
  and pull requests' under review, with their links and **Stop**; a ticket's opens its panel.
- Served to this machine only (the proxy's port is published on `127.0.0.1`). A running preview nobody visited for
  the project's idle time (60 minutes by default, 0: never) stops, except while the agent runs a step on the ticket
  or its e2e tests run; visits are the proxy's request counts. At most `UNION_MAX_PREVIEWS` previews run (3), and
  optionally fewer per project (Previews → Limits).
- Commands: from the Preview tab the user runs a command in the ticket's workspace (its container, in the checkout,
  as the agent, with its services, variables and `localhost` ports, and the preview's address while it runs) and reads the end of its output, live. Never during a
  step, one at a time per ticket, 10 minutes by default (30 at most), cancellable. A finished output can be kept
  for the implementer's next run, or sent now as a revision with a note (at the final review or once done); the
  implementer reads it as data in a "Command output from the user" section, once. Commands run often are saved by
  name in Project settings → Scripts (`config.scripts`: name, command, optional timeout) and run with one button;
  the run keeps the script's name. Running in a preview service is planned (`docs/plans/container-commands.md`).

## Previews of pull requests under review

Design and steps: [`docs/plans/review-previews.md`](../plans/review-previews.md). A pull request under review
gets what a ticket's Preview tab has, on its review page's **Preview** tab, without a ticket. No agent runs (no
Claude usage) and nothing is written to GitHub: the worker only fetches the pull request.

- Its own container `union-r<review id>` (volumes `-home`, `-ws`), made on the first start, test run or command: the
  host clones the base branch, fetches `pull/<n>/head` (forks included) and checks out the commit the review reads
  (`current_reviews.head_sha`), not the branch's tip, so the diff on screen and the running code are the same. It
  never gets the Claude credential nor a GitHub token, and is stopped once nothing runs in it. Its preview is
  compose project `union-r<id>` at `http://r<id>.union.localhost` (`{ticket.id}` renders `r<id>`, `{pr.number}` the pull
  request's number), under the same checks, cap and idle stop as a ticket's.
- Secrets: a fork's pull request never gets the project's secret variables. Another gets them only when its commit is
  on its head branch in the repository itself, which the worker checks at each checkout
  (`current_reviews.checkout_in_repo`); the tab says whose code runs and which case applies.
- When the review is reloaded at a newer head, the tab shows the checkout behind it; **Update to the reviewed commit**
  (after a confirmation) takes the preview down with its data, replaces the checkout and starts it again if it ran.
- End-to-end tests and Commands run in that container (the plain variables the settings allow, the preview's address
  while it runs; no agent services, never the secrets). A review's failure screenshots are kept with its preview
  (`preview_screenshots`, files under `attachments/r<id>/e2e/`). An output, or the last e2e result, can be **added to
  the review** as a general draft comment (what ran, how it ended, its last lines), sent with the rest of the review.
- A review's preview and runs have no events: the tab polls while one is on its way. Under review marks a review
  or a stack whose preview runs. Removing a review (or its stack) drops its pending commands, has the worker take its
  preview down and remove its container and volumes, and deletes its files.
