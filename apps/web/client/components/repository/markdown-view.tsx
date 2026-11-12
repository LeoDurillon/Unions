// A Markdown file of the repository rendered as GitHub shows it, or its source. Its links open the
// repository's files in the tab, its images load from the repository.
import { useCallback, useState, type ReactElement } from 'react';

import { markdownUrl, tabPathOf, type MarkdownBase } from '../../lib/markdown-links';
import { Segmented, type SegmentOption } from '../choice';
import { Markdown } from '../markdown';
import { TextView } from './text-view';

type Mode = 'rendered' | 'source';

const MODES: SegmentOption<Mode>[] = [
  { value: 'rendered', label: 'Rendered' },
  { value: 'source', label: 'Source' },
];

const MARKDOWN = /\.(?:md|markdown|mdown|mkd)$/iu;

/** Whether the tab renders the file as Markdown. */
export function isMarkdown(path: string): boolean {
  return MARKDOWN.test(path);
}

/** A click on a link to another file of the repository opens it here, without reloading the page. */
function followTabLink(event: MouseEvent, onPick: (path: string) => void): void {
  if (event.button !== 0) {
    return;
  }
  if (!(event.target instanceof Element) || event.metaKey || event.ctrlKey || event.shiftKey) {
    return;
  }
  const path = tabPathOf(event.target.closest('a')?.getAttribute('href') ?? '');
  if (path !== null) {
    event.preventDefault();
    onPick(path);
  }
}

/** The file rendered (the default) or as source, with the switch between them. */
export function MarkdownView({
  text,
  path,
  base,
  onPick,
}: {
  text: string;
  path: string;
  base: MarkdownBase;
  onPick: (path: string) => void;
}): ReactElement {
  const [mode, setMode] = useState<Mode>('rendered');
  // Listened on the article, not on each link: react-markdown draws them.
  const article = useCallback(
    (element: HTMLElement): (() => void) => {
      const onClick = (event: MouseEvent): void => {
        followTabLink(event, onPick);
      };
      element.addEventListener('click', onClick);
      return () => {
        element.removeEventListener('click', onClick);
      };
    },
    [onPick],
  );
  return (
    <div>
      <div className="flex justify-end px-4 pt-3">
        <Segmented legend="Show the file" options={MODES} value={mode} onChange={setMode} />
      </div>
      {mode === 'source' ? (
        <TextView text={text} path={path} />
      ) : (
        <article ref={article} className="max-w-4xl px-6 pt-2 pb-8">
          <Markdown github resolveUrl={(url, key) => markdownUrl(base, path, url, key)}>
            {text}
          </Markdown>
        </article>
      )}
    </div>
  );
}
