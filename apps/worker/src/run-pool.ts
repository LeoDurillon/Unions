// The lifecycle the queued side runs share: claimed within the run slots, cancellable, each finished with its outcome.
import type { RunSlots } from './slots';

/** How a pool claims its rows, runs one, and records how it ended. */
export type RunPoolSpec<Row extends { id: number }, Outcome> = {
  slots: RunSlots;
  claim: () => Row | null;
  run: (row: Row, signal: AbortSignal) => Promise<Outcome>;
  /** The outcome of a run that threw. */
  failed: (error: string) => Outcome;
  /** The outcome of a run stopped by `cancel` or `stop`; without it, the run's own outcome stands. */
  stopped?: Outcome;
  finish: (row: Row, outcome: Outcome) => void;
  /**
   * Whether the row is still there. A row deleted during its run (its pull request removed from
   * Union) has its run stopped on the next tick and takes no finish: there is nothing to record.
   */
  exists?: (id: number) => boolean;
};

/** Runs claimed rows while a slot is free; each run gives its slot back once finished. */
export class RunPool<Row extends { id: number }, Outcome> {
  private readonly active = new Map<number, { abort: AbortController; done: Promise<void> }>();

  constructor(private readonly spec: RunPoolSpec<Row, Outcome>) {}

  tick(): void {
    this.stopRemoved();
    while (this.spec.slots.tryTake()) {
      const row = this.spec.claim();
      if (!row) {
        this.spec.slots.release();
        return;
      }
      const abort = new AbortController();
      this.active.set(row.id, { abort, done: this.runTracked(row, abort.signal) });
    }
  }

  private stopRemoved(): void {
    const { exists } = this.spec;
    if (!exists) {
      return;
    }
    for (const [id, run] of this.active) {
      if (!exists(id)) {
        run.abort.abort();
      }
    }
  }

  /** Stops a running row; it then finishes with the `stopped` outcome. */
  cancel(id: number): void {
    this.active.get(id)?.abort.abort();
  }

  stop(): void {
    for (const { abort } of this.active.values()) {
      abort.abort();
    }
  }

  async idle(): Promise<void> {
    await Promise.all([...this.active.values()].map((run) => run.done));
  }

  /** Inside the try: a run that throws before returning its promise fails like one that rejects. */
  private async outcomeOf(row: Row, signal: AbortSignal): Promise<Outcome> {
    try {
      return await this.spec.run(row, signal);
    } catch (error) {
      return this.spec.failed(error instanceof Error ? error.message : String(error));
    }
  }

  private async runTracked(row: Row, signal: AbortSignal): Promise<void> {
    const { spec } = this;
    try {
      const outcome = await this.outcomeOf(row, signal);
      if (spec.exists && !spec.exists(row.id)) {
        return;
      }
      spec.finish(row, signal.aborted && spec.stopped ? spec.stopped : outcome);
    } finally {
      this.active.delete(row.id);
      spec.slots.release();
    }
  }
}

/** The error of a run that did not finish because the worker stopped. */
export const WORKER_STOPPED = 'The worker stopped during the run';
