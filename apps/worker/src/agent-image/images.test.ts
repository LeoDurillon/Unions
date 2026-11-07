import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  discardPendingAgentImage,
  migrateDb,
  readAgentImage,
  saveAgentImage,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
  type ImageInfo,
  type ImageRuntime,
} from '@union/core';

import { NO_HOOKS } from '../command-hooks';
import { drainCommands } from '../commands';
import { AgentImages } from './images';

const BASE = 'union-agent:local';
const DOCKERFILE = 'FROM union-agent\nRUN apt-get install -y python3\n';

let db: Db;
let projectId: number;
/** Image name → id; `build` and `pull` add to it. */
let existing: Map<string, string>;
let built: { tag: string; dockerfile: string }[];
let removed: string[];
let buildExit: number;
let checkOutput: string[];
/** Resolves a build waiting on it; null: builds end at once. */
let gate: Promise<void> | null;

function fakeImages(): ImageRuntime {
  return {
    inspect: (ref) => {
      const id = existing.get(ref);
      const info: ImageInfo | null = id === undefined ? null : { id, sizeBytes: 42 };
      return Promise.resolve(info);
    },
    async *build(spec): AsyncGenerator<string, ExecResult> {
      built.push(spec);
      yield '#1 building';
      if (gate) {
        await gate;
      }
      if (spec.signal.aborted) {
        return { exitCode: 130, stderr: '' };
      }
      if (buildExit === 0) {
        existing.set(spec.tag, `sha256:${spec.tag}`);
      }
      return { exitCode: buildExit, stderr: '' };
    },
    async *pull(ref): AsyncGenerator<string, ExecResult> {
      await Promise.resolve();
      yield `pulling ${ref}`;
      existing.set(ref, `sha256:${ref}`);
      return { exitCode: 0, stderr: '' };
    },
    tags: (repository) =>
      Promise.resolve([...existing.keys()].filter((ref) => ref.startsWith(`${repository}:`))),
    remove: (ref) => {
      removed.push(ref);
      existing.delete(ref);
      return Promise.resolve();
    },
  };
}

const runtime = {
  async *runHelper(_spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    yield* checkOutput;
    return { exitCode: checkOutput.length === 0 ? 0 : 1, stderr: '' };
  },
} as unknown as ContainerRuntime;

/** Builds wait until the returned function is called. */
function holdBuilds(): () => void {
  const held = Promise.withResolvers<void>();
  gate = held.promise;
  return () => {
    held.resolve();
  };
}

function service(): AgentImages {
  return new AgentImages(db, { runtime, images: fakeImages(), baseImage: BASE });
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  existing = new Map([[BASE, 'sha256:base1']]);
  built = [];
  removed = [];
  buildExit = 0;
  checkOutput = [];
  gate = null;
});

test('a saved Dockerfile is built on the base image, checked and applied', async () => {
  const images = service();
  saveAgentImage(db, projectId, { kind: 'dockerfile', dockerfile: DOCKERFILE });
  images.sync(projectId);
  await images.idle();
  const row = readAgentImage(db, projectId);
  expect(row).toMatchObject({ status: 'idle', pending: null, applied: { sizeBytes: 42 } });
  expect(row?.applied?.tag).toMatch(/^union-agent-p\d+:/u);
  expect(row?.output).toContain('#1 building');
  expect(built[0]?.dockerfile).toStartWith(`FROM ${BASE}\n`);
  expect(await images.imageFor(projectId)).toBe(row?.applied?.tag ?? '');
});

test('a failed build or check keeps the applied image', async () => {
  const images = service();
  buildExit = 1;
  saveAgentImage(db, projectId, { kind: 'dockerfile', dockerfile: DOCKERFILE });
  images.sync(projectId);
  await images.idle();
  expect(readAgentImage(db, projectId)?.status).toBe('failed');
  expect(await images.imageFor(projectId)).toBe(BASE);

  buildExit = 0;
  checkOutput = ['The claude CLI does not run (claude --version)'];
  saveAgentImage(db, projectId, { kind: 'image', ref: 'ghcr.io/o/img:1' });
  images.sync(projectId);
  await images.idle();
  const row = readAgentImage(db, projectId);
  expect(row?.status).toBe('failed');
  expect(row?.error).toContain('claude CLI');
  expect(row?.applied).toBeNull();
});

test('a newer save stops the build in progress; only the newer one applies', async () => {
  const images = service();
  const release = holdBuilds();
  saveAgentImage(db, projectId, { kind: 'dockerfile', dockerfile: DOCKERFILE });
  images.sync(projectId);
  await Bun.sleep(5);
  saveAgentImage(db, projectId, { kind: 'image', ref: 'ghcr.io/o/img:2' });
  images.sync(projectId);
  release();
  await images.idle();
  const row = readAgentImage(db, projectId);
  expect(row?.status).toBe('idle');
  expect(row?.applied?.tag).toBe('ghcr.io/o/img:2');
});

test('a discard stops the build and keeps what was applied', async () => {
  const images = service();
  const release = holdBuilds();
  saveAgentImage(db, projectId, { kind: 'dockerfile', dockerfile: DOCKERFILE });
  images.sync(projectId);
  await Bun.sleep(5);
  discardPendingAgentImage(db, projectId);
  images.sync(projectId);
  release();
  await images.idle();
  const row = readAgentImage(db, projectId);
  expect(row?.status).toBe('idle');
  expect(row?.applied).toBeNull();
});

test('a newer base image rebuilds the applied Dockerfile and drops the old tag', async () => {
  const images = service();
  saveAgentImage(db, projectId, { kind: 'dockerfile', dockerfile: DOCKERFILE });
  images.sync(projectId);
  await images.idle();
  const first = await images.imageFor(projectId);
  existing.set(BASE, 'sha256:base2');
  const second = await images.imageFor(projectId);
  expect(second).not.toBe(first);
  expect(built).toHaveLength(2);
  expect(readAgentImage(db, projectId)?.applied?.tag).toBe(second);
  await Bun.sleep(5);
  expect(removed).toEqual([first]);
});

test('going back to the default drops the built images; a deleted project drops them too', async () => {
  const images = service();
  saveAgentImage(db, projectId, { kind: 'dockerfile', dockerfile: DOCKERFILE });
  images.sync(projectId);
  await images.idle();
  const tag = await images.imageFor(projectId);
  saveAgentImage(db, projectId, { kind: 'default' });
  images.sync(projectId);
  await images.idle();
  await Bun.sleep(5);
  expect(await images.imageFor(projectId)).toBe(BASE);
  expect(removed).toEqual([tag]);

  existing.set(`union-agent-p${projectId}:old`, 'sha256:old');
  db.delete(schema.projects).run();
  images.sync(projectId);
  await Bun.sleep(5);
  expect(removed).toContain(`union-agent-p${projectId}:old`);
});

test('a project without its own image runs on the base image', async () => {
  expect(await service().imageFor(projectId)).toBe(BASE);
});

test('sync_agent_image hands the project to the hook', () => {
  const synced: number[] = [];
  db.insert(schema.commands).values({ type: 'sync_agent_image', payload: { projectId } }).run();
  drainCommands(db, {
    ...NO_HOOKS,
    syncAgentImage: (id) => {
      synced.push(id);
    },
  });
  expect(synced).toEqual([projectId]);
  expect(db.select().from(schema.commands).get()?.error).toBeNull();
});
