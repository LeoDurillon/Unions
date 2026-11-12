// The ticket panel's scrolling page: its hero (title, progress, what it needs), the tabs, the open tab's body.

import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { TicketHero } from './ticket-hero';
import { PanelBody, SectionTabs } from './ticket-tabs';
import type { PanelTabs } from './use-panel-tabs';

export function TicketPanelPage({
  detail,
  tabs,
  onReview,
  onOpenTicket,
}: {
  detail: TicketDetail;
  tabs: PanelTabs;
  onReview: () => void;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const { section, setSection, workerTab, setWorkerTab, viewing, openStep } = tabs;
  return (
    <>
      <TicketHero detail={detail} viewing={viewing} onOpenStep={openStep} onReview={onReview} />
      <SectionTabs detail={detail} section={section} onChange={setSection} />
      <div className="px-6 py-5">
        <PanelBody
          detail={detail}
          section={section}
          workerTab={workerTab}
          onWorkerTab={setWorkerTab}
          onOpenTicket={onOpenTicket}
          onSection={setSection}
        />
      </div>
    </>
  );
}
