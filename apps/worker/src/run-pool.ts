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
};

/** Runs claimed rows while a slot is free; each run gives its slot back once finished. */
export class RunPool<Row extends { id: number }, Outcome> {
  private readonly active = new Map<number, { abort: AbortController; done: Promise<void> }>();

  constructor(private readonly spec: RunPoolSpec<Row, Outcome>) {}

  tick(): void {
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

  private async runTracked(row: Row, signal: AbortSignal): Promise<void> {
    const { spec } = this;
    try {
      const outcome = await spec
        .run(row, signal)
        .catch((error: unknown) =>
          spec.failed(error instanceof Error ? error.message : String(error)),
        );
      spec.finish(row, signal.aborted && spec.stopped ? spec.stopped : outcome);
    } finally {
      this.active.delete(row.id);
      spec.slots.release();
    }
  }
}

/** The error of a run that did not finish because the worker stopped. */
export const WORKER_STOPPED = 'The worker stopped during the run';
