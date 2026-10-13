import type { PrDescriptionView } from '../../src/api-types';
import { request } from './api';

function base(ticketId: number): string {
  return `/api/tickets/${ticketId}/pr-description`;
}

export const prDescriptionApi = {
  get: (ticketId: number): Promise<PrDescriptionView> => request('GET', base(ticketId)),
  rewrite: (ticketId: number): Promise<PrDescriptionView> => request('POST', base(ticketId)),
  /** The user's version of the draft; the worker writes it to GitHub. */
  send: (ticketId: number, draftId: number, text: string): Promise<PrDescriptionView> =>
    request('POST', `${base(ticketId)}/${draftId}/send`, { text }),
  discard: (ticketId: number, draftId: number): Promise<PrDescriptionView> =>
    request('POST', `${base(ticketId)}/${draftId}/discard`),
  cancel: (ticketId: number, draftId: number): Promise<PrDescriptionView> =>
    request('POST', `${base(ticketId)}/${draftId}/cancel`),
};
