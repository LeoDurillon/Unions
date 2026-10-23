// Tests for RunPool: slots, failed and stopped outcomes, and the slot given back after each run.
import { describe, expect, test } from 'bun:test';

import { RunPool, type RunPoolSpec } from './run-pool';
import { RunSlots } from './slots';

type Row = { id: number };
type Outcome = { status: string };

function pool(
  rows: Row[],
  run: RunPoolSpec<Row, Outcome>['run'],
  slots = new RunSlots(2),
): { pool: RunPool<Row, Outcome>; finished: Map<number, Outcome>; slots: RunSlots } {
  const queue = [...rows];
  const finished = new Map<number, Outcome>();
  const runs = new RunPool<Row, Outcome>({
    slots,
    claim: () => queue.shift() ?? null,
    run,
    failed: (error) => ({ status: `failed: ${error}` }),
    stopped: { status: 'cancelled' },
    finish: (row, outcome) => {
      finished.set(row.id, outcome);
    },
  });
  return { pool: runs, finished, slots };
}

/** Resolves once the signal aborts, as a run that waits on its agent. */
function untilAborted(signal: AbortSignal): Promise<Outcome> {
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => {
      resolve({ status: 'ended' });
    });
  });
}

describe('RunPool', () => {
  test('claims only while a slot is free, and gives each slot back', async () => {
    const started: number[] = [];
    const runs = pool([{ id: 1 }, { id: 2 }, { id: 3 }], (row) => {
      started.push(row.id);
      return Promise.resolve({ status: 'succeeded' });
    });
    runs.pool.tick();
    expect(started).toEqual([1, 2]);
    await runs.pool.idle();
    runs.pool.tick();
    await runs.pool.idle();
    expect(started).toEqual([1, 2, 3]);
    expect(runs.finished.get(3)).toEqual({ status: 'succeeded' });
    expect(runs.slots.tryTake()).toBe(true);
    expect(runs.slots.tryTake()).toBe(true);
  });

  test('a run that throws finishes with the failed outcome', async () => {
    const runs = pool([{ id: 1 }], () => Promise.reject(new Error('boom')));
    runs.pool.tick();
    await runs.pool.idle();
    expect(runs.finished.get(1)).toEqual({ status: 'failed: boom' });
  });

  test('a run that throws before returning its promise fails the same way', async () => {
    const runs = pool([{ id: 1 }], () => {
      throw new Error('sync');
    });
    runs.pool.tick();
    await runs.pool.idle();
    expect(runs.finished.get(1)).toEqual({ status: 'failed: sync' });
  });

  test('a cancelled run finishes with the stopped outcome; the others keep running', async () => {
    const runs = pool([{ id: 1 }, { id: 2 }], (_row, signal) => untilAborted(signal));
    runs.pool.tick();
    runs.pool.cancel(1);
    await Bun.sleep(0);
    expect(runs.finished.get(1)).toEqual({ status: 'cancelled' });
    expect(runs.finished.has(2)).toBe(false);
    runs.pool.stop();
    await runs.pool.idle();
    expect(runs.finished.get(2)).toEqual({ status: 'cancelled' });
  });

  test('without a stopped outcome, a stopped run keeps its own', async () => {
    const queue: Row[] = [{ id: 1 }];
    const finished = new Map<number, Outcome>();
    const runs = new RunPool<Row, Outcome>({
      slots: new RunSlots(1),
      claim: () => queue.shift() ?? null,
      run: (_row, signal) => untilAborted(signal),
      failed: (error) => ({ status: error }),
      finish: (row, outcome) => {
        finished.set(row.id, outcome);
      },
    });
    runs.tick();
    runs.stop();
    await runs.idle();
    expect(finished.get(1)).toEqual({ status: 'ended' });
  });
});
