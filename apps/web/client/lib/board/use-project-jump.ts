// `n` on a board with nothing waiting: go to the next project in the sidebar that has tickets waiting on the user.

import type { ListedProject } from '../../../src/api-types';
import { useShortcuts } from '../ui/shortcuts';

/** The project after `currentId` in the sidebar's order, wrapping around, with tickets waiting; null when none other has. */
export function nextProjectNeedingYou(
  projects: readonly Pick<ListedProject, 'id' | 'counts'>[],
  currentId: number | null,
): number | null {
  const at = projects.findIndex((project) => project.id === currentId);
  for (let offset = 1; offset <= projects.length; offset += 1) {
    const candidate = projects[(at + offset) % projects.length];
    if (candidate && candidate.id !== currentId && candidate.counts.needsYou > 0) {
      return candidate.id;
    }
  }
  return null;
}

/**
 * Binds `n` only while the current project has nothing waiting, which is when the board's own `n`
 * (the first ticket that needs you) does nothing: the two never answer the same press.
 */
export function useProjectJump(
  projects: readonly ListedProject[],
  current: ListedProject | null,
  onSelect: (id: number) => void,
  enabled: boolean,
): void {
  const idle = (current?.counts.needsYou ?? 0) === 0;
  const next = idle ? nextProjectNeedingYou(projects, current?.id ?? null) : null;
  useShortcuts(
    {
      n:
        next === null
          ? undefined
          : () => {
              onSelect(next);
            },
    },
    enabled,
  );
}
