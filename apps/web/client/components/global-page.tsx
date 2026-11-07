// The pages of the main area that belong to no project: the running previews and the user guide.
import type { ReactElement } from 'react';

import { useGuidePage } from '../lib/guide-url';
import { GuidePage } from './guide/guide-page';
import { RunningPreviewsPage } from './previews/running-previews-page';

/** The running previews (`?page=previews`) or the user guide (`?guide=`). */
export function GlobalPage({
  page,
  onOpenTicket,
}: {
  page: 'previews' | 'guide';
  /** Opens a ticket of any project (the Previews page lists every project's). */
  onOpenTicket: (projectId: number, ticketId: number) => void;
}): ReactElement {
  const guidePage = useGuidePage();
  if (page === 'guide' && guidePage !== null) {
    return <GuidePage key={guidePage} name={guidePage} />;
  }
  return <RunningPreviewsPage onOpenTicket={onOpenTicket} />;
}
