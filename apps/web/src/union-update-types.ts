// Union's own update as the sidebar reads it: the last check, the update's state, and the work a restart would interrupt.
import type { ActiveWork, UnionUpdate } from '@union/core';

export type UnionUpdateView = {
  /** Null before the worker's first check. */
  update: Pick<
    UnionUpdate,
    | 'localSha'
    | 'remoteSha'
    | 'ahead'
    | 'behind'
    | 'subjects'
    | 'refusal'
    | 'status'
    | 'error'
    | 'checkedAt'
  > | null;
  active: ActiveWork[];
};
