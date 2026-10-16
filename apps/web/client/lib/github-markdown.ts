// Renders GitHub comment text as GitHub does: its HTML (folds, images) sanitized, and `> [!NOTE]` alerts.
import type { Options } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

/** The parts of a HTML tree node the alert plugin reads and changes. */
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export const ALERT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const ALERT_MARK = /^\s*\[!(?<kind>\w+)\]\s*/u;

function isAlertKind(value: string): value is AlertKind {
  return ALERT_KINDS.some((kind) => kind === value);
}

function firstText(node: HastNode | undefined): HastNode | undefined {
  if (!node || node.type === 'text') {
    return node;
  }
  return firstText(node.children?.find((child) => child.type !== 'text' || child.value?.trim()));
}

/** The alert a blockquote opens with (`[!WARNING]`), with its marker removed; null otherwise. */
export function takeAlert(blockquote: HastNode): AlertKind | null {
  const text = firstText(blockquote);
  const kind = text?.value?.match(ALERT_MARK)?.groups?.kind?.toLowerCase();
  if (!text?.value || !kind || !isAlertKind(kind)) {
    return null;
  }
  text.value = text.value.replace(ALERT_MARK, '');
  return kind;
}

function title(kind: AlertKind): HastNode {
  return {
    type: 'element',
    tagName: 'p',
    properties: { className: ['markdown-alert-title'] },
    children: [{ type: 'text', value: `${kind.charAt(0).toUpperCase()}${kind.slice(1)}` }],
  };
}

/** A paragraph left with no words once the marker went (`> [!NOTE]` alone on its line). */
function isEmptyParagraph(node: HastNode): boolean {
  return (
    node.tagName === 'p' &&
    (node.children ?? []).every((child) => child.type === 'text' && !child.value?.trim())
  );
}

function markAlerts(node: HastNode): void {
  for (const child of node.children ?? []) {
    markAlerts(child);
  }
  if (node.tagName !== 'blockquote') {
    return;
  }
  const kind = takeAlert(node);
  if (kind) {
    node.properties = {
      ...node.properties,
      className: ['markdown-alert', `markdown-alert-${kind}`],
    };
    node.children = [
      title(kind),
      ...(node.children ?? []).filter((child) => !isEmptyParagraph(child)),
    ];
  }
}

/** GitHub's alerts, styled by kind; runs after sanitizing, so its classes are kept. */
function rehypeAlerts(): (tree: HastNode) => void {
  return markAlerts;
}

/** The HTML GitHub renders, cleaned with GitHub's own allow list, then the alerts. */
export const GITHUB_REHYPE: Options['rehypePlugins'] = [rehypeRaw, rehypeSanitize, rehypeAlerts];
