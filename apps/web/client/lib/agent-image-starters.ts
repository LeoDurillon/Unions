// The Dockerfiles the agent image page offers to start from: JavaScript extras, Python, Rust, Go
// and PHP. Each is on the base it needs.

export type Starter = { id: string; label: string; dockerfile: string };

/**
 * Toolchains go to system paths, never under /home/node: HOME is a volume per ticket, made from the
 * image once, so what the image puts there would reach only new tickets, and never its updates.
 */
const JAVASCRIPT = `FROM union-agent
# The default image: node, npm, Bun, pnpm and yarn, git, the claude CLI and Playwright's libraries.
# Add the system tools this project's install, checks and tests need, as root, then go back to node.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \\
    && rm -rf /var/lib/apt/lists/*
USER node
`;

const PYTHON = `FROM ghcr.io/astral-sh/uv:0.9 AS uv
# The minimal image: git, the claude CLI and the node user; no Node.
FROM union-agent-base
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \\
    && rm -rf /var/lib/apt/lists/*
# uv and uvx (also what stdio MCP servers written in Python start with).
COPY --from=uv /uv /uvx /usr/local/bin/
USER node
`;

const RUST = `FROM rust:1-slim-bookworm AS rust
# The minimal image: git, the claude CLI and the node user; no Node.
FROM union-agent-base
USER root
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config libssl-dev \\
    && rm -rf /var/lib/apt/lists/*
COPY --from=rust /usr/local/rustup /usr/local/rustup
COPY --from=rust /usr/local/cargo /usr/local/cargo
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
# The agent's cargo writes its registry and builds there.
RUN chmod -R a+w /usr/local/rustup /usr/local/cargo
USER node
`;

const GO = `FROM golang:1-bookworm AS go
# The minimal image: git, the claude CLI and the node user; no Node.
FROM union-agent-base
USER root
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \\
    && rm -rf /var/lib/apt/lists/*
COPY --from=go /usr/local/go /usr/local/go
ENV PATH=/usr/local/go/bin:$PATH
USER node
`;

const PHP = `FROM composer:2 AS composer
# The minimal image: git, the claude CLI and the node user; no Node.
FROM union-agent-base
USER root
RUN apt-get update && apt-get install -y --no-install-recommends php-cli php-curl php-mbstring php-xml \\
    php-zip php-intl php-sqlite3 php-mysql php-pgsql \\
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
USER node
`;

export const STARTERS: readonly Starter[] = [
  { id: 'javascript', label: 'JavaScript', dockerfile: JAVASCRIPT },
  { id: 'python', label: 'Python', dockerfile: PYTHON },
  { id: 'rust', label: 'Rust', dockerfile: RUST },
  { id: 'go', label: 'Go', dockerfile: GO },
  { id: 'php', label: 'PHP', dockerfile: PHP },
];

/** The editor's text before the user picks one. */
export const FIRST_STARTER = JAVASCRIPT;
