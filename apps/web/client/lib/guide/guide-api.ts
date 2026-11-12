// The browser's client for the user guide's pages.

import type { GuidePage, GuidePageText } from '../../../src/guide-types';
import { request } from '../app/api';

export const guideApi = {
  pages: (): Promise<{ pages: GuidePage[] }> => request('GET', '/api/guide'),
  page: (name: string): Promise<GuidePageText> =>
    request('GET', `/api/guide/pages/${encodeURIComponent(name)}`),
};
