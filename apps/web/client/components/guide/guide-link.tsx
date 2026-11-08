// A "Learn more" link to a heading of the user guide, opened on the Guide page.

import type { ReactElement } from 'react';

import { guideHref } from '../../lib/guide/guide-links';
import { openGuide } from '../../lib/guide/guide-url';
import type { GuideTarget } from '../../lib/guide/settings-guide';

/** Opens the guide at `target` (a page and a heading of it). */
export function GuideLink({ target }: { target: GuideTarget }): ReactElement {
  const [page, anchor] = target;
  return (
    <a
      href={guideHref(page, anchor)}
      onClick={(event) => {
        event.preventDefault();
        openGuide(page, anchor);
      }}
      className="text-indigo-600 hover:underline dark:text-indigo-400"
    >
      Learn more
    </a>
  );
}
