// The ticket panel's open tab and Worker sub-tab, following the ticket to its current step.
import type { Step } from '@union/core/states';
import { useState } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { currentStep } from '../lib/labels';
import { latestWorkerTab, type Section, type WorkerTab } from './ticket-tabs';

/**
 * The open tabs; they follow the ticket to the Worker tab of its current step when it moves.
 * Nothing moves until `detail` has loaded.
 */
export function usePanelTabs(detail: TicketDetail | undefined): {
  section: Section;
  setSection: (section: Section) => void;
  workerTab: WorkerTab;
  setWorkerTab: (tab: WorkerTab) => void;
} {
  const active = detail ? currentStep(detail.ticket.phase) : undefined;
  const latest = detail ? latestWorkerTab(detail) : 'log';
  const [section, setSection] = useState<Section>('overview');
  const [workerTab, setWorkerTab] = useState<WorkerTab>('log');
  const [followed, setFollowed] = useState<Step | null | undefined>();
  // Without an effect: state set during render is applied before anything is shown.
  if (active !== undefined && followed !== active) {
    setFollowed(active);
    setSection(active ? 'worker' : 'overview');
    setWorkerTab(active ?? latest);
  }
  return { section, setSection, workerTab, setWorkerTab };
}
