import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getPreview,
  migrateDb,
  schema,
  setComposeOverride,
  setPreviewSecret,
  updatePreview,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { previewSettings } from './compose';
import { generatePreviewFile } from './compose-file';
import { startPreview, stopPreview, type PreviewDeps } from './run';

/** `${DB_PASSWORD}`, spelled out: a placeholder written as is reads like a forgotten template. */
const REFERENCE = ['$', '{DB_PASSWORD}'].join('');

const RESOLVED = {
  name: 'union-t1',
  services: {
    web: {
      image: 'nginx:1.27-alpine',
      container_name: 'web',
      ports: [{ target: 80, published: '8081' }],
      networks: { default: null },
      volumes: [{ type: 'bind', source: '/workspace/repo/site', target: '/srv' }],
    },
  },
};

let db: Db;
let ticketId: number;
let calls: HelperSpec[];
let resolved: unknown;
let upExit: number;
let answer: number;
let asked: string[];
/** `join <network>` / `leave <network>`, in the order they happened, among the compose calls. */
let network: string[];

/** The compose helper: `config` prints the resolved file, `up` and `down` succeed unless told not to. */
const runtime = {
  networkExists: () => Promise.resolve(true),
  projectNetworks: (project: string) => Promise.resolve([`${project}_default`, 'union-preview']),
  connectNetwork: (name: string, container: string) => {
    network.push(`join ${name} ${container}`);
    return Promise.resolve();
  },
  disconnectNetwork: (name: string, container: string) => {
    network.push(`leave ${name} ${container}`);
    calls.push({ image: '', command: ['', '', '', '', 'leave', name] });
    return Promise.resolve();
  },
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    calls.push(spec);
    await Promise.resolve();
    const command = spec.command.join(' ');
    if (command.includes(' config ')) {
      yield JSON.stringify(resolved);
    }
    if (command.includes(' logs ')) {
      yield 'web-1  | ready';
    }
    return { exitCode: command.includes(' up ') ? upExit : 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function deps(): PreviewDeps {
  return {
    db,
    runtime,
    settings: previewSettings({}),
    readyTimeoutMs: 50,
    readyIntervalMs: 5,
    fetchFn: (_url, init) => {
      asked.push(new Headers(init.headers).get('host') ?? '');
      return Promise.resolve(new Response('hello', { status: answer }));
    },
  };
}

function commands(): string[] {
  return calls.map((call) => call.command.slice(4).join(' '));
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
          service: 'web',
          port: 80,
          env: { MODE: 'preview' },
        },
      },
    })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Search', body: '' }).id;
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  calls = [];
  resolved = RESOLVED;
  upExit = 0;
  answer = 200;
  asked = [];
  network = [];
});

test('a preview starts from the workspace, rewritten, and runs once the service answers', async () => {
  await startPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)).toMatchObject({
    status: 'running',
    url: 'http://1.localhost:8080',
    error: null,
    logTail: 'web-1  | ready',
  });
  expect(commands()).toEqual([
    // Every profile, for what the settings offer; then the file with the profiles enabled.
    '-p union-t1 --profile * -f compose.yaml config --format json',
    '-p union-t1 -f compose.yaml config --format json',
    '-p union-t1 --project-directory /workspace/repo -f - up -d --build --remove-orphans',
    '-p union-t1 logs --no-color --tail 200',
  ]);
  // The agent's container joins the preview's own network, not the proxy's shared one.
  expect(network).toEqual(['join union-t1_default union-t1']);
  const [, config, up] = calls;
  expect(config?.env).toEqual({ MODE: 'preview' });
  expect(config?.mounts).toContainEqual({ source: 'union-t1-ws', target: '/workspace' });
  const file = JSON.parse(up?.stdin ?? '{}') as { services: { web: Record<string, unknown> } };
  expect(file.services.web.ports).toBeUndefined();
  expect(file.services.web.container_name).toBeUndefined();
  expect(file.services.web.environment).toEqual({ MODE: 'preview' });
});

test('a compose file asking for host access never reaches Docker', async () => {
  resolved = { services: { web: { image: 'x', privileged: true, networks: { default: null } } } };
  await startPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)?.status).toBe('failed');
  expect(getPreview(db, ticketId)?.error).toContain('privileged containers are not allowed');
  expect(commands().some((command) => command.includes(' up '))).toBe(false);
});

test('a failed start keeps the reason and the output, and takes down what it started', async () => {
  upExit = 1;
  await startPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)).toMatchObject({ status: 'failed', logTail: 'web-1  | ready' });
  expect(getPreview(db, ticketId)?.error).toContain('docker compose up failed');
  expect(commands().slice(-2)).toEqual([
    'leave union-t1_default',
    '-p union-t1 down -v --remove-orphans',
  ]);

  calls = [];
  upExit = 0;
  answer = 502;
  await startPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)?.error).toBe('"web" did not answer on port 80');
  expect(commands().at(-1)).toBe('-p union-t1 down -v --remove-orphans');
});

test('starts are refused without settings, without a workspace, and past the running cap', async () => {
  db.update(schema.tickets).set({ workspaceVolume: null }).run();
  await startPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)?.error).toContain('run the implementation first');

  db.update(schema.tickets).set({ workspaceVolume: 'union-t1-ws' }).run();
  for (const id of [101, 102, 103]) {
    const other = createTicket(db, { projectId: 1, title: `t${id}`, body: '' });
    updatePreview(db, other.id, { status: 'running' });
  }
  calls = [];
  await startPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)?.error).toContain('3 previews are running already');
});

test('stopping takes the compose project down with its volumes', async () => {
  await startPreview(deps(), ticketId);
  calls = [];
  await stopPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)?.status).toBe('stopped');
  // Docker refuses to remove a network a container is still on: the agent leaves first.
  expect(commands()).toEqual(['leave union-t1_default', '-p union-t1 down -v --remove-orphans']);
});

test('the file a start ran is kept as YAML; generating alone starts nothing', async () => {
  await generatePreviewFile(deps(), ticketId);
  const row = getPreview(db, ticketId);
  expect(row?.status).toBe('stopped');
  expect(row?.composeYaml).toContain('name: union-t1');
  expect(row?.composeYaml).toContain('subpath: repo/site');
  expect(row?.composeError).toBeNull();
  expect(commands()).toEqual([
    '-p union-t1 --profile * -f compose.yaml config --format json',
    '-p union-t1 -f compose.yaml config --format json',
  ]);

  resolved = { services: { web: { image: 'x', privileged: true, networks: { default: null } } } };
  await generatePreviewFile(deps(), ticketId);
  expect(getPreview(db, ticketId)?.composeError).toContain('privileged');
  expect(getPreview(db, ticketId)?.composeYaml).toBeNull();
});

test("the ticket's own file runs instead, checked, under the ticket's project, host ports kept", async () => {
  setComposeOverride(db, ticketId, 'services: {}');
  resolved = {
    name: 'mine',
    services: {
      web: {
        image: 'nginx',
        ports: [{ target: 5432, published: '15432' }],
        volumes: [{ type: 'bind', source: '/workspace/repo/site', target: '/srv' }],
      },
    },
    volumes: { union_workspace: { external: true, name: 'union-t1-ws' } },
  };
  await startPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)?.status).toBe('running');
  const [config, up] = calls;
  expect(config?.stdin).toBe('services: {}');
  expect(config?.command.slice(4).join(' ')).toBe(
    '-p union-t1 --project-directory /workspace/repo -f - config --format json',
  );
  const file = JSON.parse(up?.stdin ?? '{}') as {
    name: string;
    services: { web: Record<string, unknown> };
  };
  expect(file.name).toBe('union-t1');
  expect(file.services.web.ports).toEqual([{ target: 5432, published: '15432' }]);
  expect(file.services.web.volumes).toEqual([
    { type: 'volume', source: 'union_workspace', target: '/srv', volume: { subpath: 'repo/site' } },
  ]);

  calls = [];
  resolved = { services: { web: { image: 'x', privileged: true } } };
  await startPreview(deps(), ticketId);
  expect(getPreview(db, ticketId)?.error).toContain('Your compose file cannot run as a preview');
  expect(commands().some((command) => command.includes(' up '))).toBe(false);
});

test('several services, templates, secrets and an env file: real values run, none is kept', async () => {
  db.update(schema.projects)
    .set({
      config: {
        baseBranch: 'main',
        preview: {
          composeFile: 'compose.yaml',
          services: [
            { name: 'web', port: 80, prefix: '' },
            { name: 'api', port: 8080, prefix: 'api' },
          ],
          env: { API_URL: '{service.api.url}', PRICE: 'costs $5' },
          envFile: { service: 'api', path: '/etc/app.env' },
        },
      },
    })
    .run();
  setPreviewSecret(db, 1, 'DB_PASSWORD', 'pa$word');
  resolved = {
    services: {
      ...RESOLVED.services,
      api: { image: 'node:22', networks: { default: null } },
    },
  };
  await startPreview(deps(), ticketId);
  const row = getPreview(db, ticketId);
  expect(row?.status).toBe('running');
  expect(row?.urls).toEqual([
    { service: 'web', url: 'http://1.localhost:8080' },
    { service: 'api', url: 'http://api.1.localhost:8080' },
  ]);
  expect(asked.toSorted()).toEqual(['1.localhost', 'api.1.localhost']);

  const [, runConfig, shownConfig, up] = calls;
  expect(runConfig?.env).toMatchObject({ DB_PASSWORD: 'pa$word' });
  expect(shownConfig?.env).toMatchObject({ DB_PASSWORD: REFERENCE });
  const file = JSON.parse(up?.stdin ?? '{}') as {
    services: Record<string, Record<string, unknown>>;
    configs: Record<string, { content: string }>;
  };
  expect(file.services.web?.environment).toEqual({
    API_URL: 'http://api.1.localhost:8080',
    PRICE: 'costs $$5',
    DB_PASSWORD: 'pa$$word',
  });
  expect(file.services.api?.configs).toEqual([{ source: 'union_env', target: '/etc/app.env' }]);
  expect(file.configs.union_env?.content).toContain('DB_PASSWORD=pa$$word');
  // The file kept for the panel names the secret, never its value.
  expect(row?.composeYaml).toContain(REFERENCE);
  expect(row?.composeYaml).not.toContain('pa$');
});

test('the profiles chosen are enabled, and their services run whole', async () => {
  const config = { composeFile: 'compose.yaml', service: 'web', port: 80, env: {} };
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', preview: { ...config, profiles: ['storage'] } } })
    .run();
  const s3 = { image: 'minio/minio', profiles: ['storage'], networks: { default: null } };
  resolved = { services: { ...RESOLVED.services, s3 } };
  await startPreview(deps(), ticketId);
  expect(commands()[1]).toBe('-p union-t1 --profile storage -f compose.yaml config --format json');
  // `up` would leave out again a service still naming a profile.
  expect(calls[2]?.stdin).not.toContain('"profiles"');
});
