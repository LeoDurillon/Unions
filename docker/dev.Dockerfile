# Development image for the web app and the worker (see compose.yaml).
# The worker starts agent containers through the host's Docker socket, so it needs the Docker CLI,
# and it clones repositories on the "host" side, so it needs git; ssh fetches Union's own remote when
# it was cloned over SSH (the sidebar's Update).
FROM docker:29.6.0-cli AS docker-cli

FROM oven/bun:1.4.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates openssh-client \
    && rm -rf /var/lib/apt/lists/*
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /app
