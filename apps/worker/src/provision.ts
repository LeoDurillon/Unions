// Creates a ticket's container. Only the Claude subscription credential is seeded, the host clones,
// the files are copied in.
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import {
  AGENT_REPO_DIR,
  schema,
  type ContainerRuntime,
  type Db,
  type Ticket,
  agentContainerLimits,
  autoCompactWindow,
  claudeToken,
  imageSetting,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { seedCredentials, type ClaudeLoginSource } from './claude-login';
import { projectGitToken } from './credentials';
import { resolveTicketBase } from './ticket-base';
import { syncTicketContainer } from './ticket-files-sync';

export const REPO_DIR = AGENT_REPO_DIR;

export type ProvisionConfig = ClaudeLoginSource & {
  /** The base agent image; a project with its own runs on what `imageFor` gives. */
  readonly image: string;
  /** The image a project's agents run on (`AgentImages.imageFor`); absent: `image` for all. */
  imageFor?: (projectId: number) => Promise<string>;
  /** Base URL repositories are cloned from: `<base>/<owner>/<repo>.git`. */
  gitBaseUrl: string;
};

/**
 * The worker's: the image Union settings name (read each time, so a change applies to the next
 * container), the rest from its environment. `imageFor`: where a project's agents run, when given.
 */
export function defaultProvisionConfig(
  db: Db,
  imageFor?: ProvisionConfig['imageFor'],
): ProvisionConfig {
  return {
    get image(): string {
      return imageSetting(db, 'agentImage');
    },
    imageFor,
    gitBaseUrl: process.env.UNION_GIT_BASE_URL ?? 'https://github.com',
    credentialsPath:
      process.env.UNION_CLAUDE_CREDENTIALS ?? path.join(homedir(), '.claude', '.credentials.json'),
    claudeToken: () => claudeToken(db),
    autoCompactWindow: () => autoCompactWindow(db),
  };
}

/** The image the project's containers run from: its own agent image, built first when needed. */
export function projectImage(config: ProvisionConfig, projectId: number): Promise<string> {
  return config.imageFor ? config.imageFor(projectId) : Promise.resolve(config.image);
}

export type TicketContainer = { name: string; homeVolume: string; workspaceVolume: string };

export function containerNames(ticketId: number): TicketContainer {
  return {
    name: `union-t${ticketId}`,
    homeVolume: `union-t${ticketId}-home`,
    workspaceVolume: `union-t${ticketId}-ws`,
  };
}

async function hasFile(
  runtime: ContainerRuntime,
  container: string,
  file: string,
): Promise<boolean> {
  const stream = runtime.exec(container, ['test', '-e', file]);
  let next = await stream.next();
  while (!next.done) {
    next = await stream.next();
  }
  return next.value.exitCode === 0;
}

export type CloneSource = { url: string; publicUrl: string; secret: string | null };

/**
 * The URL the host clones from. With a token, HTTPS auth is embedded so private repositories clone
 * without relying on the host's git setup (which may be SSH-only); `publicUrl` is what the
 * container's `origin` is reset to, so the token never reaches it.
 */
export function cloneSource(
  baseUrl: string,
  owner: string,
  repo: string,
  token: string | null,
): CloneSource {
  const publicUrl = `${baseUrl}/${owner}/${repo}.git`;
  if (!token || !publicUrl.startsWith('https://')) {
    return { url: publicUrl, publicUrl, secret: null };
  }
  const authed = publicUrl.replace(
    'https://',
    `https://x-access-token:${encodeURIComponent(token)}@`,
  );
  return { url: authed, publicUrl, secret: token };
}

/** Runs git on the host without ever prompting and returns its output; the token is masked in errors. */
export async function hostGit(args: string[], secret: string | null): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const [code, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    const safe = secret ? stderr.replaceAll(secret, '***') : stderr;
    throw new Error(`git ${args[0] ?? ''} failed: ${safe.trim()}`);
  }
  return stdout;
}

/** The host clones; the container only receives the files, with a token-free `origin`. */
export async function cloneInto(
  runtime: ContainerRuntime,
  container: string,
  source: CloneSource,
  branch: string,
): Promise<void> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'union-clone-'));
  try {
    await hostGit(['clone', '--quiet', '--branch', branch, source.url, tmp], source.secret);
    await hostGit(['-C', tmp, 'remote', 'set-url', 'origin', source.publicUrl], source.secret);
    await runtime.copyIn(container, tmp, REPO_DIR);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Idempotent: creates the container, seeds credentials, clones the repo, puts the ticket's and the
 * project's files in,
 * leaves it running.
 */
export async function ensureTicketContainer(
  db: Db,
  runtime: ContainerRuntime,
  config: ProvisionConfig,
  ticket: Ticket,
): Promise<TicketContainer> {
  const names = containerNames(ticket.id);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  if (!project) {
    throw new Error(`Project ${ticket.projectId} not found`);
  }
  await runtime.create({
    ...names,
    image: await projectImage(config, project.id),
    limits: agentContainerLimits(db, names.name),
  });
  if (!(await runtime.isRunning(names.name))) {
    await runtime.start(names.name);
  }
  // Every run: the host refreshes its login (a refresh retires the token a stale copy holds), and
  // the token in Union settings may have been set, replaced or removed.
  await seedCredentials(runtime, names.name, config);
  if (!(await hasFile(runtime, names.name, `${REPO_DIR}/.git`))) {
    const token = await projectGitToken(db, project);
    const source = cloneSource(config.gitBaseUrl, project.owner, project.repo, token);
    const base = await resolveTicketBase(db, ticket, source);
    await cloneInto(runtime, names.name, source, base ?? project.config.baseBranch);
  }
  await syncTicketContainer(db, runtime, ticket, names);
  db.update(schema.tickets)
    .set({
      containerName: names.name,
      homeVolume: names.homeVolume,
      workspaceVolume: names.workspaceVolume,
    })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  return names;
}
