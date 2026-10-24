# Installation

Union runs on your machine as two processes, a web app and a worker, plus one Docker container for each ticket.
The simplest way to run all of it is Docker Compose.

## What you need

- **Linux or WSL2** with **Docker** and Compose v2. The worker starts the agents' containers through the Docker
  socket.
- **Claude Code**, logged in on this machine with a Claude Max account. Union gives each ticket's container the
  login from `~/.claude/.credentials.json`. If that file does not exist, run `claude` once and log in.
- **GitHub access** to the repository you want the agents to work on. You can paste a token or set up a GitHub App
  later, in the setup wizard; see [Your first project](first-project.md#connect-github).
- Optional: a **Notion** internal integration, to import tickets from a Notion database.

Agents run on your Claude subscription. Each step of each ticket uses some of your Claude usage, and by default two
runs can happen at the same time (see `UNION_MAX_CONCURRENT` in the [settings reference](settings.md#environment-variables)).

## Start Union with Docker Compose

```sh
git clone git@github.com:LeoDurillon/Unions.git
cd Unions
bun run compose        # or: docker compose up --build
```

The first start installs the dependencies, builds the image the agents run in (`union-agent:local`), and starts
the web app and the worker. Then open <http://localhost:5173>. The setup wizard opens on the first visit.

| Command                | What it does                            |
| ---------------------- | --------------------------------------- |
| `bun run compose`      | Builds and starts the stack             |
| `bun run compose:down` | Stops it                                |
| `bun run compose:logs` | Follows the web app's and worker's logs |

Stopping Union leaves each ticket's container and volumes in place, so its work is kept. A step that was running
when Union stopped starts again from the beginning when Union is back.

### If the worker cannot reach Docker

The worker runs as your user and needs the group that owns the Docker socket. Write both in a `.env` file next to
`compose.yaml`, then start again:

```sh
echo "DOCKER_GID=$(stat -c %g /var/run/docker.sock)" >> .env
echo "UNION_UID=$(id -u)" >> .env
echo "UNION_GID=$(id -g)" >> .env
```

## Start Union without Docker Compose

You need **Bun 1.4.1** and git on the machine, and Docker for the agents.

```sh
bun install
docker build -t union-agent:local -f docker/agent.Dockerfile docker
bun run dev            # web app on http://localhost:5173 and the worker, reloaded when files change
```

`bun run start` builds the web app once and serves it on <http://localhost:3000>, with the worker.

Outside Compose, the sidebar's **Update** button cannot restart Union for you; update with `git pull` and restart it
yourself. Previews also need the proxy that Compose starts (see [Preview environments](previews.md)).

## Ports

| Address                             | What answers                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| <http://localhost:5173>             | Union (`UNION_WEB_PORT` changes it)                                  |
| `http://t<id>.union.localhost:8080` | A ticket's preview, through the preview proxy (`UNION_PREVIEW_PORT`) |

The preview proxy listens on this machine only (`127.0.0.1`), since previews run code no one has reviewed yet.
Union's own port is published like any Compose port. Union has no login screen: keep that port away from networks
you do not trust (a firewall, or `127.0.0.1:` in front of the port in `compose.yaml`).

Next: [Your first project](first-project.md).
