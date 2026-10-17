// The previews running across projects, as the Previews page and the sidebar's count read them.
import type { Preview } from '@union/core';

/** A ticket's preview, or a pull request's under review, with what the page shows of its owner. */
export type RunningPreviewOwner =
  | { kind: 'ticket'; ticketId: number; title: string }
  | { kind: 'pull-request'; reviewId: number; number: number; title: string; url: string };

export type RunningPreview = Pick<Preview, 'id' | 'status' | 'urls' | 'url' | 'startedAt'> & {
  owner: RunningPreviewOwner;
  project: { id: number; owner: string; repo: string };
  /** Why Stop cannot be asked for now (a command of it waits for the worker); null when it can. */
  stopRefusal: string | null;
};
