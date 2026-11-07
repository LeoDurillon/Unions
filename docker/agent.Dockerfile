# The agent images, in two stages:
# - `base` (union-agent-base:local): only what Union needs in a container: git, the claude CLI, the node
#   user (uid 1000) and /workspace. A project on another stack (Rust, Go, Python…) starts its own Dockerfile
#   from it.
# - the last stage (union-agent:local, the default): base plus the JavaScript toolchains (node/npm, Bun,
#   pnpm and yarn through corepack) and the system libraries Playwright's browsers need.
# Build both: `docker build --target base -t union-agent-base:local -f docker/agent.Dockerfile docker`, then
# `docker build -t union-agent:local -f docker/agent.Dockerfile docker`.
FROM oven/bun:1.4.1 AS bun
FROM node:22-slim AS node

FROM debian:bookworm-slim AS base
ARG CLAUDE_VERSION=2.1.296
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
# The claude CLI's release binary at a pinned version, checked against its release manifest: no Node needed,
# and it lives in the image, not under HOME (a volume that would hide it).
RUN set -eu; \
    case "$(dpkg --print-architecture)" in amd64) platform=linux-x64 ;; arm64) platform=linux-arm64 ;; \
      *) echo "Unsupported architecture" >&2; exit 1 ;; esac; \
    release="https://downloads.claude.ai/claude-code-releases/${CLAUDE_VERSION}"; \
    checksum="$(curl -fsSL "${release}/manifest.json" | tr -d '\n ' \
      | sed -n "s/.*\"${platform}\":{[^}]*\"checksum\":\"\([a-f0-9]\{64\}\)\".*/\1/p")"; \
    test -n "${checksum}"; \
    curl -fsSL -o /usr/local/bin/claude "${release}/${platform}/claude"; \
    echo "${checksum}  /usr/local/bin/claude" | sha256sum -c -; \
    chmod 755 /usr/local/bin/claude
# The version is pinned by the image: the CLI must not update itself into the HOME volume.
ENV DISABLE_AUTOUPDATER=1
# uid 1000 "node" is the agent user and owns the HOME volume (the same user as the node images have).
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --shell /bin/bash --create-home node \
    && mkdir /workspace && chown node:node /workspace
USER node
ENV HOME=/home/node
WORKDIR /workspace
CMD ["sleep", "infinity"]

FROM base
USER root
# node and npm (with npx and corepack) from the official image, on the same Debian release.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
    && corepack enable
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
# System libraries Chromium and Firefox need, for end-to-end tests against ticket previews. The browser
# itself is installed on first use at the repository's own Playwright version, into the HOME volume.
RUN npx -y playwright@1.56.1 install-deps chromium firefox && rm -rf /var/lib/apt/lists/* /root/.npm
USER node
