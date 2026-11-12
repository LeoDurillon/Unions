// The review's file keys: j opens the next file, k the previous one, in the order the list shows them. v marks the
// open file viewed and opens the next (or unmarks it).

import type { DiffFileSummary } from '../../../src/api-types';
import { treeOrder } from '../../lib/review/file-tree';
import { useShortcuts } from '../../lib/ui/shortcuts';
import type { Layout } from './file-rows';
import { useViewed } from './viewed-context';

/** The files as the list shows them: the shown ones (as a list or a tree), then the ignored ones. */
function shownOrder(files: DiffFileSummary[], layout: Layout): DiffFileSummary[] {
  const shown = files.filter((file) => !file.ignored);
  const ignored = files.filter((file) => file.ignored);
  return [...(layout === 'tree' ? treeOrder(shown) : shown), ...ignored];
}

/** Opens the file `step` away from the selected one, stopping at either end. */
export function useFileKeys(
  files: DiffFileSummary[],
  layout: Layout,
  selected: number | null,
  onSelect: (id: number) => void,
): void {
  const order = shownOrder(files, layout);
  const at = order.findIndex((file) => file.id === selected);
  const go =
    (step: 1 | -1): (() => void) =>
    () => {
      const target = order[at + step];
      if (target) {
        onSelect(target.id);
      }
    };
  const viewed = useViewed();
  const markViewed = (): void => {
    const file = order[at];
    if (!file) {
      return;
    }
    const was = viewed.isViewed(file);
    viewed.toggle(file);
    if (!was) {
      go(1)();
    }
  };
  useShortcuts({ j: go(1), k: go(-1), v: markViewed });
}
