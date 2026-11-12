// Markdown as the panel shows it.

import {
  isValidElement,
  useMemo,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { GITHUB_REHYPE } from '../../lib/markdown/github-markdown';
import { HEADING_ANCHORS } from './heading-anchors';
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

/** A wide table scrolls on its own instead of pushing the page wider. */
function Table({ children }: { children?: ReactNode }): ReactElement {
  return (
    <div className="max-w-full overflow-x-auto">
      <table>{children}</table>
    </div>
  );
}

const COMPONENTS: Components = { img: Image, input: TaskBox, pre: CodeBlock, table: Table };

/** Turns an inline code span into something else (a link), or null to keep it as code. */
type RenderCode = (text: string) => ReactNode | null;

/** The components with inline code given to `renderCode`; a block's code (it ends with a newline) is left alone. */
function withCode(renderCode: RenderCode | undefined, anchors: boolean): Components {
  const base = anchors ? { ...COMPONENTS, ...HEADING_ANCHORS } : COMPONENTS;
  if (!renderCode) {
    return base;
  }
  function Code({ children, ...props }: ComponentProps<'code'>): ReactNode {
    const inline = typeof children === 'string' && !children.includes('\n') && !props.className;
    return (inline ? renderCode?.(children) : null) ?? <code {...props}>{children}</code>;
  }
  return { ...base, code: Code };
}

/**
 * Markdown as the panel shows it. `files` maps a ticket file's name to its address, for the
 * `attachment:<name>` links a description holds (images kept from a Notion page).
 */
export function Markdown({
  children,
  files,
  compact = false,
  github = false,
  renderCode,
  resolveUrl,
  anchors = false,
}: {
  children: string;
  files?: Record<string, string>;
  /** Headings no bigger than bold text and tighter spacing: for comments inside a list. */
  compact?: boolean;
  /** Text from GitHub: its HTML (folds, images) is rendered, sanitized, and its alerts styled. */
  github?: boolean;
  /** Inline code spans it turns into something else (links to the diff); null keeps a span as code. */
  renderCode?: RenderCode;
  /** Rewrites a link (`href`) or an image (`src`), as `key` says; undefined leaves it to the default. */
  resolveUrl?: (url: string, key: string) => string | undefined;
  /** Headings get GitHub's ids, for links to `#heading` (the user guide). */
  anchors?: boolean;
}): ReactElement {
  const components = useMemo(() => withCode(renderCode, anchors), [renderCode, anchors]);
  const transform = (url: string, key: string): string => {
    if (url.startsWith(ATTACHMENT)) {
      return files?.[url.slice(ATTACHMENT.length)] ?? '';
    }
    return resolveUrl?.(url, key) ?? defaultUrlTransform(url);
  };
  return (
    <div className={compact ? 'markdown markdown-compact' : 'markdown'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={github ? GITHUB_REHYPE : undefined}
        urlTransform={transform}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
