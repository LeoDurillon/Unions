// The addresses of the shared services the proxy opens (`s3-p1.union.localhost`), as links.
import type { ReactElement } from 'react';

const PILL =
  'inline-block rounded-full border border-indigo-200 px-2 py-0.5 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40';

/** One link per opened service; nothing when none is open. */
export function SharedLinks({
  urls,
}: {
  urls: { service: string; url: string }[] | null;
}): ReactElement | null {
  if (!urls || urls.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs">
      {urls.map(({ service, url }) => (
        <li key={url}>
          <a className={PILL} href={url} target="_blank" rel="noreferrer" title={url}>
            {service} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
