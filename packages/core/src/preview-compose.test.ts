import { expect, test } from 'bun:test';

import {
  workspaceSubpaths,
  envFileProblem,
  exposedServiceProblem,
  previewCompose,
  tidyCompose,
  type PreviewTarget,
} from './preview-compose';
import { composeProblems, type ComposeJson } from './preview-compose-check';

/** What `docker compose config --format json` printed for a web app and its database. */
function resolved(): ComposeJson {
  return {
    name: 'repo',
    networks: { default: { name: 'repo_default', ipam: {} } },
    services: {
      db: {
        image: 'postgres:16-alpine',
        environment: { POSTGRES_PASSWORD: 'x' },
        networks: { default: null },
        volumes: [{ type: 'volume', source: 'pgdata', target: '/var/lib/postgresql/data' }],
      },
      web: {
        image: 'nginx:1.27-alpine',
        container_name: 'fixed-name',
        environment: { GREETING: 'hi' },
        labels: { 'traefik.http.routers.evil.rule': 'Host(`3.localhost`)', team: 'front' },
        networks: { default: null },
        ports: [{ target: 80, published: '8081' }],
        volumes: [
          {
            type: 'bind',
            source: '/workspace/repo/site',
            target: '/usr/share/nginx/html',
            read_only: true,
          },
        ],
      },
    },
    volumes: { pgdata: { name: 'repo_pgdata' } },
  };
}

const TARGET: PreviewTarget = {
  project: 'union-t12',
  workspaceVolume: 'union-t12-ws',
  exposed: [{ service: 'web', port: 80, host: '12.localhost' }],
  env: { API_URL: 'http://api:8080' },
};

function withService(service: Record<string, unknown>): ComposeJson {
  return { services: { app: { image: 'node:22', ...service } } };
}

test('a plain web app and its database can run as a preview', () => {
  expect(composeProblems(resolved())).toEqual([]);
  expect(composeProblems({ services: {} })).toEqual(['The compose file has no services']);
});

test('anything giving a container power over the host is refused', () => {
  expect(composeProblems(withService({ privileged: true }))).toEqual([
    'app: privileged containers are not allowed',
  ]);
  expect(composeProblems(withService({ network_mode: 'host' }))).toHaveLength(1);
  expect(composeProblems(withService({ network_mode: 'service:db' }))).toEqual([]);
  expect(composeProblems(withService({ pid: 'host', cap_add: ['SYS_ADMIN'] }))).toHaveLength(2);
  expect(composeProblems(withService({ devices: ['/dev/kvm'] }))).toHaveLength(1);
  expect(
    composeProblems(withService({ build: { context: '/workspace/repo', network: 'host' } })),
  ).toEqual(['app: builds with host access are not allowed']);
});

test('only files of the repository may be mounted, built from or read', () => {
  const mount = (source: string): ComposeJson =>
    withService({ volumes: [{ type: 'bind', source, target: '/x' }] });
  expect(composeProblems(mount('/workspace/repo/src'))).toEqual([]);
  expect(composeProblems(mount('/workspace/repo'))).toEqual([]);
  expect(composeProblems(mount('/workspace/attachments'))).toEqual([
    'app: mounts /workspace/attachments, outside the repository',
  ]);
  expect(composeProblems(mount('/workspace/repo/../attachments'))).toHaveLength(1);
  expect(composeProblems(mount('/var/run/docker.sock'))).toHaveLength(1);
  expect(composeProblems(withService({ build: { context: '/home/me' } }))).toHaveLength(1);
  expect(
    composeProblems(withService({ env_file: [{ path: '/workspace/attachments/.env' }] })),
  ).toEqual(['app: reads an env file outside the repository']);
});

test('volumes and networks shared between previews are refused', () => {
  expect(composeProblems({ ...withService({}), volumes: { data: { external: true } } })).toEqual([
    'volume "data" is external: previews would share it',
  ]);
  expect(
    composeProblems({
      ...withService({}),
      volumes: { data: { driver_opts: { type: 'none', o: 'bind', device: '/' } } },
    }),
  ).toHaveLength(1);
  expect(
    composeProblems({ ...withService({}), networks: { shared: { external: true } } }),
  ).toHaveLength(1);
  expect(
    composeProblems(
      withService({ volumes: [{ type: 'volume', source: 'nope', target: '/data' }] }),
    ),
  ).toEqual(['app: volume "nope" is not declared in the file']);
});

test("the preview's file: its own project, no fixed names or host ports, mounts from the workspace", () => {
  const file = previewCompose(resolved(), TARGET);
  expect(file.name).toBe('union-t12');
  const services = file.services as Record<string, Record<string, unknown>>;
  const web = services.web ?? {};
  expect(web.container_name).toBeUndefined();
  expect(web.ports).toBeUndefined();
  expect(web.volumes).toEqual([
    {
      type: 'volume',
      source: 'union_workspace',
      target: '/usr/share/nginx/html',
      read_only: true,
      volume: { subpath: 'repo/site' },
    },
  ]);
  expect(web.environment).toEqual({ GREETING: 'hi', API_URL: 'http://api:8080' });
  expect(web.networks).toEqual({ default: null, union_preview: null });
  expect(web.labels).toEqual({
    team: 'front',
    'traefik.enable': 'true',
    'traefik.docker.network': 'union-preview',
    'traefik.http.routers.union-t12-web.rule': 'Host(`12.localhost`)',
    'traefik.http.routers.union-t12-web.entrypoints': 'web',
    'traefik.http.services.union-t12-web.loadbalancer.server.port': '80',
  });
  // The database keeps its volume and stays off the proxy's network.
  expect(services.db?.volumes).toEqual([
    { type: 'volume', source: 'pgdata', target: '/var/lib/postgresql/data' },
  ]);
  expect(services.db?.networks).toEqual({ default: null });
  expect(file.volumes).toMatchObject({
    union_workspace: { external: true, name: 'union-t12-ws' },
  });
  expect(file.networks).toMatchObject({
    union_preview: { external: true, name: 'union-preview' },
  });
});

test('the exposed service must exist and have its own network', () => {
  expect(exposedServiceProblem(resolved(), 'web')).toBeNull();
  expect(exposedServiceProblem(resolved(), 'api')).toBe(
    'The compose file has no service "api" (it has: db, web)',
  );
  expect(exposedServiceProblem(withService({ network_mode: 'service:db' }), 'app')).toContain(
    'shares another',
  );
});

test("Union's own file passes the checks for its ticket only, and keeps them otherwise", () => {
  const file = previewCompose(resolved(), TARGET);
  expect(composeProblems(file, { workspaceVolume: 'union-t12-ws' })).toEqual([]);
  // Another ticket's workspace: refused as any external volume.
  expect(composeProblems(file, { workspaceVolume: 'union-t13-ws' })).toEqual([
    'volume "union_workspace" is external: previews would share it',
  ]);
  // In the repository's own file, Union's names are refused.
  expect(composeProblems(file)).toContain('"union_workspace" is a name Union uses');
  // An edit stays checked.
  const edited = { ...file, services: { web: { image: 'x', privileged: true } } };
  expect(composeProblems(edited, { workspaceVolume: 'union-t12-ws' })).toEqual([
    'web: privileged containers are not allowed',
  ]);
});

test('the settings Docker prints as unset are left out of the file people read', () => {
  expect(
    tidyCompose({
      networks: { default: { name: 'x_default', ipam: {} } },
      services: {
        db: {
          command: null,
          entrypoint: null,
          environment: {},
          labels: {},
          networks: { default: null },
        },
      },
    }),
  ).toEqual({
    networks: { default: { name: 'x_default' } },
    services: { db: { networks: { default: null } } },
  });
});

test('each exposed service gets its own route; the variables can also be a file in one service', () => {
  const file = previewCompose(resolved(), {
    ...TARGET,
    exposed: [
      { service: 'web', port: 80, host: '12.localhost' },
      { service: 'db', port: 5432, host: 'db.12.localhost' },
    ],
    envFile: { service: 'db', path: '/etc/app/.env', content: 'API_URL=http://api:8080\n' },
  });
  const services = file.services as Record<string, Record<string, unknown>>;
  expect(services.db?.labels).toMatchObject({
    'traefik.http.routers.union-t12-db.rule': 'Host(`db.12.localhost`)',
    'traefik.http.services.union-t12-db.loadbalancer.server.port': '5432',
  });
  expect(services.db?.networks).toEqual({ default: null, union_preview: null });
  expect(services.db?.configs).toEqual([{ source: 'union_env', target: '/etc/app/.env' }]);
  expect(services.web?.configs).toBeUndefined();
  expect(file.configs).toEqual({ union_env: { content: 'API_URL=http://api:8080\n' } });
  expect(composeProblems(file, { workspaceVolume: 'union-t12-ws' })).toEqual([]);
  // The repository's own file may not take the name.
  expect(composeProblems({ ...withService({}), configs: { union_env: { content: '' } } })).toEqual([
    '"union_env" is a name Union uses',
  ]);
});

test('the env file may not land in a folder mounted from the workspace', () => {
  const file = previewCompose(resolved(), TARGET);
  expect(envFileProblem(file, { service: 'db', path: '/etc/app/.env' })).toBeNull();
  expect(envFileProblem(file, { service: 'web', path: '/usr/share/nginx/html/.env' })).toContain(
    'would be written into the workspace (mounted at /usr/share/nginx/html)',
  );
  expect(envFileProblem(file, { service: 'web', path: '.env' })).toContain('must be absolute');
  expect(envFileProblem(file, { service: 'api', path: '/x' })).toContain('not in the compose file');
});

test('the workspace folders a file mounts are listed, for the missing ones to be created', () => {
  const file = previewCompose(resolved(), TARGET);
  expect(workspaceSubpaths(file)).toEqual(['repo/site']);
  const twice = {
    services: {
      a: {
        volumes: [{ type: 'volume', source: 'union_workspace', volume: { subpath: 'repo/x' } }],
      },
      b: {
        volumes: [
          { type: 'volume', source: 'union_workspace', volume: { subpath: 'repo/x' } },
          { type: 'volume', source: 'pgdata', target: '/data' },
        ],
      },
    },
  };
  expect(workspaceSubpaths(twice)).toEqual(['repo/x']);
});

function workspaceMountOf(volume: Record<string, unknown>): ComposeJson {
  return {
    services: {
      app: {
        image: 'x',
        volumes: [{ type: 'volume', source: 'union_workspace', target: '/x', volume }],
      },
    },
    volumes: { union_workspace: { external: true, name: 'union-t12-ws' } },
  };
}

test("a mount of the workspace may only reach its repository, never the ticket's files", () => {
  const union = { workspaceVolume: 'union-t12-ws' };
  expect(composeProblems(workspaceMountOf({ subpath: 'repo/src' }), union)).toEqual([]);
  expect(composeProblems(workspaceMountOf({ subpath: 'attachments' }), union)).toEqual([
    'app: mounts the workspace outside its repository ("attachments")',
  ]);
  expect(composeProblems(workspaceMountOf({ subpath: 'repo/../attachments' }), union)).toHaveLength(
    1,
  );
  expect(composeProblems(workspaceMountOf({}), union)).toHaveLength(1);
});
