import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  getPreview,
  migrateDb,
  schema,
  setPreviewSecret,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
  type WorkspaceOwner,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { drainCommands, type CommandHooks, type PreviewAction } from '../commands';
import { previewSettings } from './compose';
import { PreviewManager } from './manager';
import { startReviewPreview, updateReviewPreview } from './review-preview';
import { loadTarget, type PreviewDeps } from './target';

let db: Db;
let reviewId: number;
/** Every helper command and container call, in order. */
let calls: string[];

const runtime = {
  networkExists: () => Promise.resolve(true),
  projectNetworks: () => Promise.resolve([]),
  create: (spec: { name: string }) => {
    calls.push(`create ${spec.name}`);
    return Promise.resolve();
  },
  isRunning: () => Promise.resolve(false),
  start: (name: string) => {
    calls.push(`start ${name}`);
    return Promise.resolve();
  },
  stop: (name: string) => {
    calls.push(`stop ${name}`);
    return Promise.resolve();
  },
  copyIn: () => Promise.reject(new Error('no clone in unit tests')),
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    calls.push(spec.command.filter((part) => !part.startsWith('/var/run')).join(' '));
    await Promise.resolve();
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function deps(withConfig = true): PreviewDeps {
  return {
    db,
    runtime,
    settings: previewSettings({}),
    ...(withConfig
      ? { config: { image: 'agent', gitBaseUrl: 'file:///nowhere', credentialsPath: '/none' } }
      : {}),
  };
}

function setReview(values: Partial<typeof schema.currentReviews.$inferInsert>): void {
  db.update(schema.currentReviews).set(values).where(eq(schema.currentReviews.id, reviewId)).run();
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
          services: [{ name: 'api', port: 8080, prefix: 'api' }],
          env: { DB: 'db_{ticket.id}', PR: '#{pr.number}', API: '{service.api.url}' },
        },
      },
    })
    .returning()
    .get().id;
  setPreviewSecret(db, projectId, 'TOKEN', 'hush');
  reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 1582,
      title: 'PR',
      url: 'u',
      author: 'alice',
      headBranch: 'feature',
      baseBranch: 'main',
      headSha: 'abc1234',
    })
    .returning()
    .get().id;
  calls = [];
});

test("a pull request's preview runs from its own checkout, under its own names", () => {
  expect(() => loadTarget(deps(), { reviewId })).toThrow('not checked out yet');
  setReview({ checkoutSha: 'abc1234', checkoutInRepo: true });
  const target = loadTarget(deps(), { reviewId });
  expect(target).toMatchObject({
    owner: { reviewId },
    project: `union-r${reviewId}`,
    workspaceVolume: `union-r${reviewId}-ws`,
    exposed: [{ service: 'api', port: 8080, host: `api.r${reviewId}.localhost` }],
    plain: {
      DB: `db_r${reviewId}`,
      PR: '#1582',
      API: `http://api.r${reviewId}.localhost:8080`,
    },
    secrets: { TOKEN: 'hush' },
  });
});

test('secrets only for a commit on a branch of the repository itself, never for a fork', () => {
  setReview({ checkoutSha: 'abc1234', checkoutInRepo: false });
  expect(loadTarget(deps(), { reviewId }).secrets).toEqual({});
  setReview({ checkoutInRepo: true, fromFork: true });
  expect(loadTarget(deps(), { reviewId }).secrets).toEqual({});
});

test('a start that cannot check the pull request out fails with the reason', async () => {
  const unavailable = await startReviewPreview(deps(false), reviewId);
  expect(unavailable).toMatchObject({
    ok: false,
    error: 'The worker cannot start containers here',
  });
  setReview({ headSha: null });
  await startReviewPreview(deps(), reviewId);
  expect(getPreview(db, { reviewId })).toMatchObject({
    status: 'failed',
    error: "Open the pull request's review first: its files are not read yet",
  });
});

test('an update takes the preview down, empties the checkout as root, then checks out again', async () => {
  setReview({ checkoutSha: 'old0000' });
  await updateReviewPreview(deps(), reviewId);
  expect(calls).toEqual([
    `docker compose --ansi never -p union-r${reviewId} down -v --remove-orphans`,
    `create union-r${reviewId}`,
    `start union-r${reviewId}`,
    'rm -rf /workspace/repo',
    `stop union-r${reviewId}`,
  ]);
  // The fake has no clone: the failure is kept, the old commit too.
  expect(getPreview(db, { reviewId })).toMatchObject({ status: 'failed' });
  expect(db.select().from(schema.currentReviews).get()?.checkoutSha).toBe('old0000');
});

test("preview commands carry a ticket or a pull request's review", () => {
  const seen: [WorkspaceOwner, PreviewAction][] = [];
  const hooks = {
    preview: (owner: WorkspaceOwner, action: PreviewAction) => {
      seen.push([owner, action]);
    },
  } as unknown as CommandHooks;
  db.insert(schema.commands)
    .values([
      { type: 'preview_start', payload: { reviewId } },
      { type: 'review_checkout_update', payload: { reviewId } },
      { type: 'preview_stop', payload: {} },
    ])
    .run();
  drainCommands(db, hooks);
  expect(seen).toEqual([
    [{ reviewId }, 'start'],
    [{ reviewId }, 'update'],
  ]);
  const failed = db.select().from(schema.commands).all().at(-1);
  expect(failed?.error).toContain('needs a ticketId or a numeric "reviewId"');
});

test("a pull request's container removal takes its preview down first; its e2e tests wait", async () => {
  const manager = new PreviewManager(deps());
  await manager.takeDownFor(`union-r${reviewId}`);
  expect(calls).toEqual([
    `docker compose --ansi never -p union-r${reviewId} down -v --remove-orphans`,
  ]);
  manager.run({ reviewId }, 'e2e');
  expect(getPreview(db, { reviewId })).toMatchObject({
    e2eStatus: 'skipped',
    e2eOutput: "A pull request's end-to-end tests are not supported yet",
  });
});
