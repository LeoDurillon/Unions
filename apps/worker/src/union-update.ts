// Union's own update: checks the checkout against `origin/main` every few minutes, and starts the update the user asked for.
import path from 'node:path';

import {
  activeWork,
  emitEvent,
  initStartTicks,
  lastRestartAsked,
  readUnionUpdate,
  recordUpdateCheck,
  setUpdateStatus,
  UPDATE_CHECK_MS,
  UPDATE_STALE_MS,
  updateInProgress,
  type Db,
  type UnionUpdate,
} from '@union/core';

import type { CommandHooks } from './command-hooks';
import { checkCheckout, UNION_ROOT } from './union-update-git';

/** Runs apart from the worker: the pull reloads the worker (`bun --watch`), and the update must outlive that. */
const UPDATE_SCRIPT = path.join(UNION_ROOT, 'scripts', 'union-update.ts');

/** Why an update the user asked for cannot start now, or null. */
export function startRefusal(db: Db, row: UnionUpdate | null, force: boolean): string | null {
  if (!row) {
    return 'The checkout has not been checked yet';
  }
  if (updateInProgress(row)) {
    return 'An update is already running';
  }
  if (row.refusal ?? row.error) {
    return row.refusal ?? row.error;
  }
  if (row.behind === 0 || row.remoteSha === null) {
    return 'Already up to date';
  }
  const active = activeWork(db);
  if (!force && active.length > 0) {
    const list = active.map((work) => `${work.label}: ${work.count}`).join(', ');
    return `Work in progress (${list}): wait, or Update anyway`;
  }
  return null;
}

/** The commands' side of the updater. */
export function unionUpdateHooks(
  updater: UnionUpdater,
): Pick<CommandHooks, 'checkUnionUpdate' | 'updateUnion'> {
  return {
    checkUnionUpdate: () => {
      void updater.check();
    },
    updateUnion: (force) => {
      updater.update(force);
    },
  };
}

export class UnionUpdater {
  private lastCheck = 0;
  private checking: Promise<void> | null = null;
  private starting: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly supervised = process.env.UNION_SUPERVISED === '1',
  ) {}

  /**
   * At start: the restart an update asked for is done, once the container itself started again.
   * The pull reloads the worker first (`bun --watch`), and that reload must keep waiting.
   */
  async recover(): Promise<void> {
    const row = readUnionUpdate(this.db);
    if (row?.status !== 'restarting') {
      return;
    }
    const asked = lastRestartAsked(this.db);
    const init = await initStartTicks();
    if (asked === null || init === null || init !== asked.init) {
      setUpdateStatus(this.db, 'idle');
    }
  }

  /** Whether new work waits; an update that stopped moving long ago gives the worker back. */
  paused(now = Date.now()): boolean {
    const row = readUnionUpdate(this.db);
    if (row && updateInProgress(row) && now - row.statusAt > UPDATE_STALE_MS) {
      setUpdateStatus(this.db, 'failed', 'The update stopped before it finished');
      return false;
    }
    return updateInProgress(row);
  }

  tick(now = Date.now()): void {
    if (now - this.lastCheck >= UPDATE_CHECK_MS) {
      void this.check();
    }
  }

  /** Fetches and records where the checkout stands; one check at a time. */
  check(): Promise<void> {
    this.lastCheck = Date.now();
    this.checking ??= this.runCheck();
    return this.checking;
  }

  /** Checks again (the sidebar's state may be old), then hands the pull and the restart to the update script. */
  update(force: boolean): void {
    this.starting ??= this.runStart(force);
  }

  async idle(): Promise<void> {
    await Promise.all([this.checking, this.starting]);
  }

  private async runCheck(): Promise<void> {
    try {
      recordUpdateCheck(this.db, await checkCheckout(this.supervised));
    } catch (error) {
      emitEvent(this.db, { type: 'union_update_failed', payload: { error: String(error) } });
    } finally {
      this.checking = null;
    }
  }

  private async runStart(force: boolean): Promise<void> {
    try {
      await this.start(force);
    } finally {
      this.starting = null;
    }
  }

  private async start(force: boolean): Promise<void> {
    await this.check();
    const row = readUnionUpdate(this.db);
    const refusal = startRefusal(this.db, row, force);
    if (refusal !== null || !row?.remoteSha) {
      if (row) {
        setUpdateStatus(this.db, row.status === 'failed' ? 'failed' : 'idle', refusal);
      }
      return;
    }
    setUpdateStatus(this.db, 'updating');
    emitEvent(this.db, {
      type: 'union_update_started',
      payload: { from: row.localSha, to: row.remoteSha, force },
    });
    const proc = Bun.spawn(['bun', UPDATE_SCRIPT, row.localSha, row.remoteSha], {
      cwd: UNION_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: true,
    });
    proc.unref();
  }
}
