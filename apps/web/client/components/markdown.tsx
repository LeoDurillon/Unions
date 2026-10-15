import { useState, type ComponentProps, type ReactElement } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ATTACHMENT = 'attachment:';

/** An image that cannot load says so (a Notion link expired) instead of leaving a hole. */
function Image({ src, alt }: ComponentProps<'img'>): ReactElement {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    return (
      <span className="my-2 block rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700">
        Image not available{alt ? ` (${alt})` : ''}: its link may have expired. See the original
        page.
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      onError={() => {
        setBroken(true);
      }}
    />
  );
}

const COMPONENTS = { img: Image };

/**
 * Markdown as the panel shows it. `files` maps a ticket file's name to its address, for the
 * `attachment:<name>` links a description holds (images kept from a Notion page).
 */
export function Markdown({
  children,
  files,
  compact = false,
}: {
  children: string;
  files?: Record<string, string>;
  /** Headings no bigger than bold text and tighter spacing: for comments inside a list. */
  compact?: boolean;
}): ReactElement {
  const transform = (url: string): string =>
    url.startsWith(ATTACHMENT)
      ? (files?.[url.slice(ATTACHMENT.length)] ?? '')
      : defaultUrlTransform(url);
  return (
    <div className={compact ? 'markdown markdown-compact' : 'markdown'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={transform} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
