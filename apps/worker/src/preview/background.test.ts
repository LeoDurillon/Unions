import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  setPreviewSecret,
  updatePreview,
  type ContainerRuntime,
  type Db,
  type ExecOptions,
  type ExecResult,
  type HelperSpec,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { pauseAgentServices, startAgentServices, withEnvironment } from './background';
import { previewSettings } from './compose';
import { stopPreview } from './run';
import type { PreviewDeps } from './target';

const RESOLVED = {
  services: {
    web: { image: 'nginx', networks: { default: null } },
    db: {
      image: 'postgres',
      networks: { default: null },
      ports: [{ target: 5432, published: '5432', protocol: 'tcp' }],
    },
  },
};

let db: Db;
let ticketId: number;
let composeCalls: string[];
let upExit: number;
let execs: { name: string; env?: Record<string, string> }[];

const runtime = {
  networkExists: () => Promise.resolve(true),
  projectNetworks: () => Promise.resolve([]),
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    if (spec.command[0] !== 'docker') {
      return { exitCode: 0, stderr: '' };
    }
    const args = spec.command.slice(4).join(' ');
    composeCalls.push(args);
    if (args.includes('config')) {
      yield JSON.stringify(RESOLVED);
    }
    return { exitCode: args.includes(' up ') ? upExit : 0, stderr: '' };
  },
  async *exec(
    name: string,
    _command: string[],
    options: ExecOptions = {},
  ): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    execs.push({ name, env: options.env });
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function deps(): PreviewDeps {
  return { db, runtime, settings: previewSettings({}) };
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      config: {
        baseBranch: 'main',
        preview: {
          composeFile: 'compose.yaml',
          services: [{ name: 'web', port: 80, prefix: '' }],
          env: { DATABASE_URL: 'postgres://db:5432/app' },
          agentServices: ['db'],
        },
      },
    })
    .returning()
    .get().id;
  setPreviewSecret(db, projectId, 'DB_PASSWORD', 'secret');
  ticketId = createTicket(db, { projectId, title: 'Search', body: '' }).id;
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  composeCalls = [];
  upExit = 0;
  execs = [];
});

test("the step's commands in the ticket's container get the variables; others do not", async () => {
  const wrapped = withEnvironment(runtime, 'union-t1', { DATABASE_URL: 'x' });
  for (const name of ['union-t1', 'union-a9']) {
    const stream = wrapped.exec(name, ['true'], { env: { OWN: '1' } });
    await stream.next();
  }
  expect(execs).toEqual([
    { name: 'union-t1', env: { DATABASE_URL: 'x', OWN: '1' } },
    { name: 'union-a9', env: { OWN: '1' } },
  ]);
  expect(await wrapped.networkExists('x')).toBe(true);
});

test("only the agent's services start, and the step gets the plain variables, not the secrets", async () => {
  const started = await startAgentServices(deps(), ticketId);
  expect(started).toEqual({
    env: { DATABASE_URL: 'postgres://db:5432/app' },
    forwards: [{ service: 'db', port: 5432, targetPort: 5432 }],
    problems: [],
  });
  expect(composeCalls.at(-1)).toBe('-p union-t1 --project-directory /workspace/repo -f - up -d db');
});

test('the agent gets only the variables the setting lets through', async () => {
  const project = db.select().from(schema.projects).get();
  const preview = project?.config.preview;
  if (!project || !preview) {
    throw new Error('no project');
  }
  db.update(schema.projects)
    .set({
      config: { ...project.config, preview: { ...preview, agentVariables: { mode: 'none' } } },
    })
    .run();
  expect((await startAgentServices(deps(), ticketId)).env).toEqual({});
});

test('with forwarding off, no port goes to localhost', async () => {
  const project = db.select().from(schema.projects).get();
  const preview = project?.config.preview;
  if (!project || !preview) {
    throw new Error('no project');
  }
  db.update(schema.projects)
    .set({ config: { ...project.config, preview: { ...preview, forwardPorts: false } } })
    .run();
  expect((await startAgentServices(deps(), ticketId)).forwards).toEqual([]);
});

test('services that cannot start leave the step without them, and say why in the log', async () => {
  upExit = 1;
  expect(await startAgentServices(deps(), ticketId)).toEqual({
    env: {},
    forwards: [],
    problems: [],
  });
  const failed = db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === 'agent_services_failed');
  expect(failed).toHaveLength(1);
});

test('after the step the services stop, unless the preview uses them', async () => {
  await pauseAgentServices(deps(), ticketId);
  expect(composeCalls).toEqual(['-p union-t1 stop']);
  composeCalls = [];
  await pauseAgentServices(deps(), ticketId, true);
  expect(composeCalls).toEqual([]);
  updatePreview(db, ticketId, { status: 'running' });
  await pauseAgentServices(deps(), ticketId);
  expect(composeCalls).toEqual([]);
});

test("stopping the preview during a step keeps the agent's services", async () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  await stopPreview(deps(), ticketId);
  expect(composeCalls).toEqual(['-p union-t1 rm --stop --force web']);
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  composeCalls = [];
  await stopPreview(deps(), ticketId);
  expect(composeCalls).toEqual(['-p union-t1 down -v --remove-orphans']);
});
