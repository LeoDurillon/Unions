# Troubleshooting

Start with the **Log** tab of the ticket's Worker tab: it shows what the agent and Union did, in order. The
Compose logs (`bun run compose:logs`) show the web app and the worker.

## Installation

**The worker cannot reach Docker** ("permission denied" on `/var/run/docker.sock`).
Set `DOCKER_GID` to the socket's group, and `UNION_UID`/`UNION_GID` to your user, in `.env`. See
[Installation](installation.md#if-the-worker-cannot-reach-docker).

**Agents fail at once with an authentication error.**
Union gives the agents the Claude login from `~/.claude/.credentials.json`. Run `claude` on the host and log in
again, then **Retry** the step.

**The image `union-agent:local` is missing.**
Compose builds it on start. Without Compose, build it:
`docker build -t union-agent:local -f docker/agent.Dockerfile docker`.

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

**"Claude usage limit reached."**
Your subscription's usage limit was reached. Wait until it resets, then click **Retry**. To use it more slowly,
lower `UNION_MAX_CONCURRENT` or pick lighter models in **Union settings → Models**.

**The implementation stops after a few attempts with failing checks.**
The agent reached the project's iteration limit. Read the check output in the Log, then **Request revision** with
guidance, or raise the limit in **Settings → Checks**. Check that the check command passes on the base branch
first.

**"A git hook refused to commit some changes."**
The repository's pre-commit hook refused the agent's changes. Commit without hooks, leave the changes out, or send
the agent back with guidance. See [When a step stops](ticket-lifecycle.md#when-a-step-stops).

**A step restarted from the beginning.**
Union restarted (an update, a crash, `docker compose restart`) while it ran. Steps resume from their start.

**The rebase stopped: "the pushed branch has commits the workspace lacks".**
Someone pushed to the ticket's branch. Union refuses to rewrite it so their commits are not lost. Bring their
commits in on GitHub or locally, or ask them to push elsewhere.

## Previews

**The preview address does not answer.**
Check that the `proxy` service runs (`docker compose ps`) and use the port in the address
(`http://t<id>.union.localhost:8080`). Look at the services' output in the Preview tab: a service may have crashed.

**Union refuses my Compose file.**
Previews refuse privileged containers, the host network, the Docker socket, mounts outside the repository and
external volumes. Move what you need into **compose additions**, or drop those settings for previews.

**The preview stopped by itself.**
Nobody opened it for the project's idle time (an hour by default). Change it in **Settings → Previews → Limits**.

## Still stuck?

Back up the database (`bun run db:backup`) before you try anything drastic, and open an issue on Union's repository
with the relevant part of the Log. Never paste tokens, keys or credentials.
