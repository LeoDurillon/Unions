# Troubleshooting

Start with the **Log** tab of the ticket's Steps tab: it shows what the agent and Union did, in order. The
Compose logs (`bun run compose:logs`) show the web app and the worker.

## Installation

**The worker cannot reach Docker** ("permission denied" on `/var/run/docker.sock`).
Set `DOCKER_GID` to the socket's group, and `UNION_UID`/`UNION_GID` to your user, in `.env`. See
[Installation](installation.md#if-the-worker-cannot-reach-docker).

**Agents fail at once with an authentication error.**
Union gives the agents the Claude login from `~/.claude/.credentials.json`. Run `claude` on the host and log in
again, then **Retry** the step.

**The image `union-agent:local` (or `union-agent-base:local`) is missing.**
Compose builds both on start. Without Compose, build them:
`docker build --target base -t union-agent-base:local -f docker/agent.Dockerfile docker`, then
`docker build -t union-agent:local -f docker/agent.Dockerfile docker`.

**The project's agent image does not build, or fails its check.**
Open **Settings → Agents → Agent image**: the build log is under the editor, and the reason above it. The agents keep
the image they had until a save passes. "Runs as user 0": end the Dockerfile with `USER node`. "COPY failed": the
Dockerfile is built without the repository's files, so install what you need with `RUN` instead.

**A step fails with "could not be built again on the new base image".**
After `union-agent:local` or `union-agent-base:local` is rebuilt (by `bun run compose` after an update of Union
that changed them), each project's Dockerfile on
it is built again the first time a ticket needs it. Open the Agent image page, fix the Dockerfile and save, then **Retry** the step.

**An agent says a tool is missing (python, go, a system library).**
Give the project its own [agent image](agents.md#the-agent-image) with that tool installed.

## GitHub

**The wizard does not list my Project.**
A Project owned by a user account needs a classic token with the `repo` and `project` scopes: fine-grained tokens
and GitHub Apps cannot reach it.

**A banner says the project has no GitHub access.**
Its token was removed or expired, or the app installation is gone. Fix it in **Settings → General**.

**CI checks do not show, or "Re-run" fails with a permission error.**
The GitHub App needs read access to Checks and Commit statuses, and read and write access to Actions. If you added
those permissions to an app already installed, accept them on GitHub (organization **Settings → GitHub Apps**).

**A ticket moved on GitHub went back to Backlog.**
Its parent ticket is not Done yet: a ticket cannot start before its parent.

**My edit of the title or description was not written to GitHub.**
The issue changed on GitHub after you opened the edit. Union does not overwrite it: reload and edit again.

## Runs

**A build or test run was killed ("exit 137").**
The container reached its memory limit and its biggest process was stopped. Raise **Memory per agent container**
(or **per preview service**) in [Union settings → Resources](settings.md#resources), then **Retry**.

**"Claude usage limit reached."**
Your subscription's usage limit was reached. The step is paused, and Union runs it again by itself a couple of
minutes after the limit resets: the notice says when. **Retry now** runs it at once (it stops again if the limit
is still reached). **Claude usage** in the sidebar says which window is full and when it starts over. When Union
cannot tell the reset time, it tries again every 30 minutes or so. To use it more slowly,
lower `UNION_MAX_CONCURRENT` or pick lighter models in **Union settings → All agents**.

**The implementation stops after a few attempts with failing checks.**
The agent reached the project's iteration limit. Read the check output in the Log, then **Request revision** with
guidance, or raise the limit in **Settings → Checks**. Check that the check command passes on the base branch
first.

**"A git hook refused to commit some changes."**
The repository's pre-commit hook refused the agent's changes. Commit without hooks, leave the changes out, or send
the agent back with guidance. See [When a step stops](ticket-lifecycle.md#when-a-step-stops).

**A step restarted from the beginning.**
Union restarted (an update, a crash, `docker compose restart`) while it ran. The step is not failed: Union runs
it again from its start, on its own, and the interrupted run shows **Interrupted** in the Log. This uses Claude
usage again, so wait for running steps to finish before restarting Union when you can.

**The rebase stopped: "the pushed branch has commits the workspace lacks".**
Someone pushed to the ticket's branch. Union refuses to rewrite it so their commits are not lost. Click **Resync from
GitHub** on the PR tab to bring their commits into Union's copy, then rebase again
([When someone else pushes to the branch](branches.md#when-someone-else-pushes-to-the-branch)).

**The sidebar says "Reconnecting…".**
Union lost its live connection to its server: the server is restarting, or stopped. Union tries again on its own
(every few seconds, then every 30 seconds) and, once it is back, the board catches up with what changed in
between; you do not need to reload. If it stays, check that Union is still running (`docker compose ps`), and
start it again if it stopped.

## Previews

**The preview address does not answer.**
Check that the `proxy` service runs (`docker compose ps`) and use the port in the address
(`http://t<id>.union.localhost:8080`). Look at the services' output in the Preview tab: a service may have crashed.

**Union refuses my Compose file.**
Previews refuse privileged containers, the host network, the Docker socket, mounts outside the repository,
external volumes, builds tagged with the name of an image Union runs (such as `node:22` or `union-agent`), and
volumes or networks named `union-…`. The message says which service or volume. Move what you need into **compose
additions**, rename it, or drop those settings for previews.

**The preview stopped by itself.**
Nobody opened it for the project's idle time (an hour by default). Change it in **Environments → Limits**.

**The preview fails with "all predefined address pools have been fully subnetted".**
Docker has no room left for the preview's networks: each preview makes two, and Docker allows about 30 by default.
Previews of merged or cancelled tickets are removed on their own; reset or stop previews you no longer need, or
remove cancelled tickets. To allow many more networks, set `default-address-pools` with smaller subnets in Docker's
`daemon.json` (for example `{"base": "172.80.0.0/12", "size": 24}`) and restart Docker.

## Still stuck?

Back up the database (`bun run db:backup`) before you try anything drastic, and open an issue on Union's repository
with the relevant part of the Log. Never paste tokens, keys or credentials.
