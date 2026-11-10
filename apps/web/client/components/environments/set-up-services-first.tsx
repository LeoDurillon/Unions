// What a page of the Environments tab shows before the project's previews are set up: the way to Services.
import type { ReactElement } from 'react';

import { openEnvironments } from '../../lib/environments-url';
import { Button } from '../ui';

/** Variables, tests and limits need the compose file and its services first. */
export function SetUpServicesFirst(): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
      <p className="text-zinc-500">Choose the compose file and its services first.</p>
      <Button
        onClick={() => {
          openEnvironments('services');
        }}
      >
        Go to Services
      </Button>
    </div>
  );
}
