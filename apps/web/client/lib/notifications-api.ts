// The browser's client for the notifications: a page of them, marking them read and clearing them.
import type { NotificationPage } from '../../src/routes/notifications';
import { request } from './api';

const BASE = '/api/notifications';

export const notificationsApi = {
  /** Newest first; `before` continues after the oldest one shown. */
  page: (before: number | null): Promise<NotificationPage> =>
    request('GET', before === null ? BASE : `${BASE}?before=${before}`),
  markRead: (id: number): Promise<unknown> => request('POST', `${BASE}/${id}/read`),
  markAllRead: (): Promise<unknown> => request('POST', `${BASE}/read-all`),
  clearAll: (): Promise<unknown> => request('DELETE', BASE),
};
