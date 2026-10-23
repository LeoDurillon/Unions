// A settings page that needs another one done first, with the way there.
import type { ReactElement } from 'react';

import { openSettings, sectionLabel, type SettingsSection } from '../../lib/settings-sections';
import { Button } from '../ui';

/** A settings page that needs another one done first, with the way there. */
export function SetUpFirst({
  section,
  what,
}: {
  section: SettingsSection;
  what: string;
}): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
      <p className="text-zinc-500">{what} first.</p>
      <Button
        onClick={() => {
          openSettings(section);
        }}
      >
        Go to {sectionLabel(section)}
      </Button>
    </div>
  );
}
