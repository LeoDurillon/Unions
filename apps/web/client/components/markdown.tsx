// Markdown as the panel shows it.
import { isValidElement, useState, type ComponentProps, type ReactElement } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { GITHUB_REHYPE } from '../lib/github-markdown';
import { MermaidDiagram } from './mermaid-diagram';

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

/** A task list's box (`- [x]`): shown as a mark, since checking it here would change nothing. */
function TaskBox({ type, checked, ...props }: ComponentProps<'input'>): ReactElement {
  if (type !== 'checkbox') {
    return <input type={type} {...props} />;
  }
  return (
    <>
      <span aria-hidden className={`task-box ${checked ? 'task-box-done' : ''}`}>
        {checked ? '✓' : ''}
      </span>
      <span className="sr-only">{checked ? 'Done: ' : 'Not done: '}</span>
    </>
  );
}

/** The source of a ```mermaid block, when `children` (a `<pre>`'s) is one. */
function mermaidSource(children: unknown): string | null {
  if (!isValidElement<{ className?: string; children?: unknown }>(children)) {
    return null;
  }
  const { className, children: text } = children.props;
  return className?.split(' ').includes('language-mermaid') === true && typeof text === 'string'
    ? text
    : null;
}

/** A code block, or the diagram it holds when it is Mermaid. */
function CodeBlock({ children, ...props }: ComponentProps<'pre'>): ReactElement {
  const source = mermaidSource(children);
  return source === null ? <pre {...props}>{children}</pre> : <MermaidDiagram source={source} />;
}

const COMPONENTS = { img: Image, input: TaskBox, pre: CodeBlock };

/**
 * Markdown as the panel shows it. `files` maps a ticket file's name to its address, for the
 * `attachment:<name>` links a description holds (images kept from a Notion page).
 */
export function Markdown({
  children,
  files,
  compact = false,
  github = false,
}: {
  children: string;
  files?: Record<string, string>;
  /** Headings no bigger than bold text and tighter spacing: for comments inside a list. */
  compact?: boolean;
  /** Text from GitHub: its HTML (folds, images) is rendered, sanitized, and its alerts styled. */
  github?: boolean;
}): ReactElement {
  const transform = (url: string): string =>
    url.startsWith(ATTACHMENT)
      ? (files?.[url.slice(ATTACHMENT.length)] ?? '')
      : defaultUrlTransform(url);
  return (
    <div className={compact ? 'markdown markdown-compact' : 'markdown'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={github ? GITHUB_REHYPE : undefined}
        urlTransform={transform}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
