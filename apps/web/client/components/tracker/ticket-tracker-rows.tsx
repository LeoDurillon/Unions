// The ticket's rows for the trackers it can come from, in its Overview: one per kind, linked or offering a link.

import { integrationKinds, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { TicketTrackerRow } from './ticket-tracker-row';

/** The tab a row's comment count opens: its tracker's. */
export type TrackerRowsTab = IntegrationKindName;

export function TicketTrackerRows({
  detail,
  onOpenTab,
}: {
  detail: TicketDetail;
  /** Opens the tracker's tab: the comments the row counts. */
  onOpenTab: (tab: IntegrationKindName) => void;
}): ReactElement {
  return (
    <>
      {integrationKinds().map(({ kind }) => (
        <TicketTrackerRow
          key={kind}
          detail={detail}
          kind={kind}
          onOpenComments={() => {
            onOpenTab(kind);
          }}
        />
      ))}
    </>
  );
}
