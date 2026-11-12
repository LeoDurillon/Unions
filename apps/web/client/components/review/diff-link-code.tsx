// Inline code naming a file of the change (`path`, `path:12`, `path:12-30`) as a link that opens it
// in the diff. It opens at those lines.

import { diffLinkOf } from '@union/core/diff-links';
import { useCallback, useMemo, type ReactNode } from 'react';

import type { ReviewTarget } from '../../lib/review/review-target';
import { useDiff } from '../../lib/review/use-review';
import { useOpenLines } from './report-open';

/** For `Markdown`'s `renderCode`: a link for a changed file's reference, null for any other code. */
export function useDiffLinks(
  target: ReviewTarget,
  openDiff: () => void,
): (text: string) => ReactNode | null {
  const files = useDiff(target).data?.files;
  const changed = useMemo(() => new Set(files?.map((file) => file.path)), [files]);
  const onOpen = useOpenLines(openDiff);
  return useCallback(
    (text: string) => {
      const link = diffLinkOf(text, changed);
      if (!link) {
        return null;
      }
      return (
        <button
          type="button"
          title={`Open ${link.path} in the diff`}
          className="text-indigo-700 underline decoration-dotted underline-offset-2 hover:decoration-solid dark:text-indigo-300"
          onClick={() => {
            onOpen(link.path, link.lines ?? undefined);
          }}
        >
          <code>{text}</code>
        </button>
      );
    },
    [changed, onOpen],
  );
}
