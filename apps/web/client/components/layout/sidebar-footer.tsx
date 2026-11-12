// The foot of the sidebar: the live connection's state, Claude usage, and Union's Update.

import type { ReactElement } from 'react';

import { UpdateButton } from '../union-update/update-button';
import { ClaudeMeter } from '../usage/claude-meter';
import { StreamPill } from './stream-pill';

/** The live connection's state (only while it is down), Claude usage, and Union's Update. */
export function SidebarFooter(): ReactElement {
  return (
    <>
      <StreamPill />
      <ClaudeMeter />
      <UpdateButton />
    </>
  );
}
