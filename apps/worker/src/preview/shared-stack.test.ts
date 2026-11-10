// Tests for the services a project's previews share: started once, joined to each preview, released.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getPreview,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { previewSettings } from './compose';
import { startPreview, stopPreview, type PreviewDeps } from './run';

const SHARED = 'union-p1-shared-clamav-1';

const RESOLVED = {
  name: 'union-t1',
  services: {
    web: {
      image: 'nginx:1.27-alpine',
      depends_on: { clamav: { condition: 'service_healthy', required: true } },
      networks: { default: null },
    },
    clamav: {
      image: 'clamav/clamav',
      ports: [{ target: 3310, published: '3310', protocol: 'tcp' }],
      networks: { default: null },
    },
  },
};

let db: Db;
let ticketId: number;
let calls: HelperSpec[];
/** `join`/`leave <network> <container> [aliases]`, in order. */
let network: string[];
/** The networks each container is on, as Docker would say. */
let attached: Map<string, Set<string>>;
/** `<container>: <command>` of each command run in a container, and the exit it gives. */
let execs: string[];
let execExit: number;

function onNetwork(name: string): string[] {
  return [...attached].filter(([, networks]) => networks.has(name)).map(([container]) => container);
}

const runtime = {
  networkExists: (name: string) => Promise.resolve(!name.endsWith('-proxy')),
  projectNetworks: (project: string) => Promise.resolve([`${project}_default`, 'union-preview']),
  serviceContainers: (name: string, service: string) =>
    Promise.resolve(name === 'union-p1-shared_default' ? [`union-p1-shared-${service}-1`] : []),
  networkContainers: (name: string) => Promise.resolve(onNetwork(name)),
  containerNetworks: (container: string) =>
    Promise.resolve([...(attached.get(container) ?? new Set<string>())]),
  connectNetwork: (name: string, container: string, aliases: string[] = []) => {
    network.push(`join ${name} ${container} [${aliases.join(',')}]`);
    attached.set(container, new Set([...(attached.get(container) ?? []), name]));
    return Promise.resolve();
  },
  disconnectNetwork: (name: string, container: string) => {
    network.push(`leave ${name} ${container}`);
    attached.get(container)?.delete(name);
    return Promise.resolve();
  },
  async *exec(container: string, command: string[]): AsyncGenerator<string, ExecResult> {
    execs.push(`${container}: ${command.join(' ')}`);
    await Promise.resolve();
    yield 'done';
    return { exitCode: execExit, stderr: execExit === 0 ? '' : 'database exists' };
  },
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    if (spec.command[0] !== 'docker') {
      return { exitCode: 0, stderr: '' };
    }
    calls.push(spec);
    await Promise.resolve();
    const command = spec.command.join(' ');
    if (command.includes(' config ')) {
      yield JSON.stringify(RESOLVED);
    }
    if (command.includes('-p union-p1-shared') && command.includes(' up ')) {
      attached.set(SHARED, new Set(['union-p1-shared_default']));
    }
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function deps(): PreviewDeps {
  return {
    db,
    runtime,
    settings: previewSettings({}),
    readyTimeoutMs: 50,
    readyIntervalMs: 5,
    fetchFn: () => Promise.resolve(new Response('hello', { status: 200 })),
  };
}

type Sent = { services: Record<string, Record<string, unknown> | undefined> };

/** The file given on stdin to the compose call whose file holds `text`. */
function sent(text: string): Sent {
  return JSON.parse(calls.find((call) => call.stdin?.includes(text))?.stdin ?? '{}') as Sent;
}

function composeCalls(): string[] {
  return calls
    .map((call) => call.command.slice(4).join(' '))
    .filter((command) => !command.includes(' config ') && !command.includes(' logs '));
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
          env: {},
          sharedServices: ['clamav'],
        },
      },
    })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Scan', body: '' }).id;
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  calls = [];
  network = [];
  attached = new Map();
  execs = [];
  execExit = 0;
});

function withCommands(): void {
  db.update(schema.projects)
    .set({
      config: {
        baseBranch: 'main',
        preview: {
          composeFile: 'compose.yaml',
          services: [{ name: 'web', port: 80, prefix: '' }],
          env: {},
          sharedServices: ['clamav'],
          sharedCommands: [
            { service: 'clamav', create: 'make {ticket.id}', drop: 'drop {ticket.id}' },
          ],
        },
      },
    })
    .run();
}

test('a preview runs without its shared services, which join its network under their names', async () => {
  await startPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })?.status).toBe('running');
  expect(composeCalls()).toEqual([
    '-p union-t1 --project-directory /workspace/repo -f - up --no-start --build --remove-orphans',
    '-p union-p1-shared -f - up -d --no-recreate --wait --wait-timeout 180',
    '-p union-t1 --project-directory /workspace/repo -f - up -d --remove-orphans',
  ]);
  expect(network).toContain(`join union-t1_default ${SHARED} [clamav]`);
  const preview = sent('nginx');
  expect(Object.keys(preview.services)).toEqual(['web']);
  expect(preview.services.web?.depends_on).toBeUndefined();
  const stack = sent('union-p1-shared');
  expect(Object.keys(stack.services)).toEqual(['clamav']);
  expect(stack.services.clamav?.env_file).toBeUndefined();
});

test('the last preview to stop takes the shared services down, their data kept', async () => {
  await startPreview(deps(), { ticketId });
  await stopPreview(deps(), { ticketId });
  expect(network).toContain(`leave union-t1_default ${SHARED}`);
  expect(composeCalls().slice(-2)).toEqual([
    '-p union-p1-shared down --remove-orphans',
    '-p union-t1 down -v --remove-orphans',
  ]);
});

test('the shared services stay while another preview uses them', async () => {
  await startPreview(deps(), { ticketId });
  attached.get(SHARED)?.add('union-t7_default');
  await stopPreview(deps(), { ticketId });
  expect(composeCalls().some((command) => command.includes('union-p1-shared down'))).toBe(false);
});

test('without the setting, the preview runs its own copies', async () => {
  db.update(schema.projects)
    .set({
      config: {
        baseBranch: 'main',
        preview: {
          composeFile: 'compose.yaml',
          services: [{ name: 'web', port: 80, prefix: '' }],
          env: {},
        },
      },
    })
    .run();
  await startPreview(deps(), { ticketId });
  expect(composeCalls().some((command) => command.includes('union-p1-shared'))).toBe(false);
});

test('each preview gets its own data on a shared service before it starts, and loses it at Stop', async () => {
  withCommands();
  await startPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })?.status).toBe('running');
  expect(execs).toEqual([`${SHARED}: sh -c make ${ticketId}`]);
  await stopPreview(deps(), { ticketId });
  expect(execs.at(-1)).toBe(`${SHARED}: sh -c drop ${ticketId}`);
});

test('a preview whose data could not be made does not start', async () => {
  withCommands();
  execExit = 1;
  await startPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })?.error).toContain(
    "The preview's data in clamav could not be made (exit 1",
  );
  expect(composeCalls()).not.toContain(
    '-p union-t1 --project-directory /workspace/repo -f - up -d --remove-orphans',
  );
});
