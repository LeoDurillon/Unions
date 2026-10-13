# Plan: preview environments

Status: designed in `SPEC.md` ("Preview environments (planned)"). Not built.

Summary: from the final review on (and after Done), the ticket panel shows **Start preview**. The worker runs the
app from the ticket's branch in a `union-t<id>-preview` container (no GitHub or Claude credentials), started from a
per-project configuration (`image`, `install`, `start`, `port`, `env` in `projects.config.preview`). A Traefik
container in the compose stack serves it at `http://<ticket id>.localhost`. Start/stop/restart are commands handled by
the worker; state and a Preview log are streamed as events; at most N previews run at once.

## Open questions (to answer before building)

- Apps needing extra services (Postgres, a queue): start a compose file from the repository per ticket, or out of
  scope at first? Senova seems to need Postgres, so this decides whether previews help it at first.
- Several ports (separate frontend and API): route `api.<id>.localhost` to a second port, or keep one port?
- Reach: this machine only (default), or the local network too?
