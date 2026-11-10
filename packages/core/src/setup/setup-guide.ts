// Puts Union's user guide in a setup run's container, beside the repository, so the agent reads how each setting works.
import path from 'node:path';

import type { ContainerRuntime } from '../runtime';

/** The checkout's `documentation/`: the guide the web app serves. */
const GUIDE_DIR = path.resolve(import.meta.dir, '..', '..', '..', '..', 'documentation');

/** Where the setup agent finds the guide: outside the repository, so nothing there changes. */
export const SETUP_GUIDE_PATH = '/workspace/union-guide';

export function copySetupGuide(runtime: ContainerRuntime, container: string): Promise<void> {
  return runtime.copyIn(container, GUIDE_DIR, SETUP_GUIDE_PATH);
}
