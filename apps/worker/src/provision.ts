import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { AGENT_REPO_DIR, schema, type ContainerRuntime, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';

import { syncAttachments } from './attachments-sync';
import { projectGitToken } from './credentials';
import { rejoinRunningPreview } from './preview/network';
import { resolveTicketBase } from './ticket-base';

export const AGENT_HOME = '/home/node';
export const REPO_DIR = AGENT_REPO_DIR;

export type ProvisionConfig = {
  image: string;
  /** Base URL repositories are cloned from: `<base>/<owner>/<repo>.git`. */
  gitBaseUrl: string;
  /** Host path of the Claude credentials file to seed from. */
  credentialsPath: string;
};

export function defaultProvisionConfig(): ProvisionConfig {
  return {
    image: process.env.UNION_AGENT_IMAGE ?? 'union-agent:local',
    gitBaseUrl: process.env.UNION_GIT_BASE_URL ?? 'https://github.com',
    credentialsPath:
      process.env.UNION_CLAUDE_CREDENTIALS ?? path.join(homedir(), '.claude', '.credentials.json'),
  };
}

export type TicketContainer = { name: string; homeVolume: string; workspaceVolume: string };

export function containerNames(ticketId: number): TicketContainer {
  return {
    name: `union-t${ticketId}`,
    homeVolume: `union-t${ticketId}-home`,
    workspaceVolume: `union-t${ticketId}-ws`,
  };
}

/** Only the Claude subscription credential is seeded: no MCP tokens, no history. */
export async function seedCredentials(
  runtime: ContainerRuntime,
  container: string,
  credentialsPath: string,
): Promise<void> {
  const raw: unknown = JSON.parse(await readFile(credentialsPath, 'utf8'));
  const oauth =
    typeof raw === 'object' && raw !== null && 'claudeAiOauth' in raw ? raw.claudeAiOauth : null;
  if (!oauth) {
    throw new Error(`No claudeAiOauth entry in ${credentialsPath}`);
  }
  await runtime.writeFile(
    container,
    `${AGENT_HOME}/.claude/.credentials.json`,
    JSON.stringify({ claudeAiOauth: oauth }),
  );
  await runtime.writeFile(
    container,
    `${AGENT_HOME}/.claude.json`,
    JSON.stringify({ hasCompletedOnboarding: true }),
    '644',
  );
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
 * Idempotent: creates the container, seeds credentials, clones the repo, puts the ticket's files in,
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
  await runtime.create({ ...names, image: config.image });
  if (!(await runtime.isRunning(names.name))) {
    await runtime.start(names.name);
  }
  // Every run: the host refreshes the login, and a refresh retires the token a stale copy holds.
  await seedCredentials(runtime, names.name, config.credentialsPath);
  if (!(await hasFile(runtime, names.name, `${REPO_DIR}/.git`))) {
    const token = await projectGitToken(db, project);
    const source = cloneSource(config.gitBaseUrl, project.owner, project.repo, token);
    const base = await resolveTicketBase(db, ticket, source);
    await cloneInto(runtime, names.name, source, base ?? project.config.baseBranch);
  }
  await syncAttachments(db, runtime, names.name, ticket.id);
  await rejoinRunningPreview(db, runtime, ticket.id);
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
