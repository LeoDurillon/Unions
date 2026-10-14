FROM oven/bun:1.4.1 AS bun

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
# Toolchains the implementation agent and the checks commonly need: node/npm (base image), Bun, and
# pnpm/yarn through corepack. Projects on other stacks need their own image (see SPEC, previews).
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx && corepack enable
RUN npm install -g @anthropic-ai/claude-code@2.1.296
# System libraries Chromium needs, for end-to-end tests against ticket previews. The browser itself is
# installed on first use at the repository's own Playwright version, into the HOME volume.
RUN npx -y playwright@1.56.1 install-deps chromium && rm -rf /var/lib/apt/lists/* /root/.npm
# The node image ships uid 1000 as "node"; it is the agent user and owns the HOME volume.
USER node
ENV HOME=/home/node
WORKDIR /workspace
CMD ["sleep", "infinity"]
