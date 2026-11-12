// Markdown headings with the ids GitHub gives them, so links to `page.md#heading` land on them.

import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';

import { headingSlug } from '../../lib/markdown/heading-slug';

/** The text a heading shows, through its emphasis, code and links. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child: ReactNode) => textOf(child)).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return '';
}

function H1({ children, ...props }: ComponentProps<'h1'>): ReactElement {
  return (
    <h1 id={headingSlug(textOf(children))} {...props}>
      {children}
    </h1>
  );
}

function H2({ children, ...props }: ComponentProps<'h2'>): ReactElement {
  return (
    <h2 id={headingSlug(textOf(children))} {...props}>
      {children}
    </h2>
  );
}

function H3({ children, ...props }: ComponentProps<'h3'>): ReactElement {
  return (
    <h3 id={headingSlug(textOf(children))} {...props}>
      {children}
    </h3>
  );
}

/** The heading components for `Markdown`'s `anchors`. */
export const HEADING_ANCHORS: Components = { h1: H1, h2: H2, h3: H3 };
