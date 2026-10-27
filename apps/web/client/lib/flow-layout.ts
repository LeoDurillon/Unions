// Places the nodes of a spec report's map in layers, top to bottom: each node one layer below the
// deepest node pointing at it (the links closing a cycle aside; a node nothing points at just above
// what it points at), ordered in its layer near the nodes it comes from.

export const NODE_WIDTH = 184;
export const NODE_HEIGHT = 48;
const GAP_X = 24;
const GAP_Y = 64;

type Link = { from: string; to: string };

/** Each node's top-left corner, and the size of the whole map. */
export type FlowLayout = {
  at: ReadonlyMap<string, { x: number; y: number }>;
  width: number;
  height: number;
};

function linkKey(link: Link): string {
  return `${link.from}\n${link.to}`;
}

/** The links that close a cycle, found by a depth-first walk in the nodes' order. */
function cycleLinks(ids: string[], links: Link[]): Set<string> {
  const next = new Map(ids.map((id) => [id, links.filter((l) => l.from === id).map((l) => l.to)]));
  const state = new Map<string, 'open' | 'done'>();
  const closing = new Set<string>();
  const visit = (id: string): void => {
    state.set(id, 'open');
    for (const to of next.get(id) ?? []) {
      if (state.get(to) === 'open') {
        closing.add(linkKey({ from: id, to }));
      } else if (!state.has(to)) {
        visit(to);
      }
    }
    state.set(id, 'done');
  };
  for (const id of ids) {
    if (!state.has(id)) {
      visit(id);
    }
  }
  return closing;
}

/**
 * Each node's layer: the longest path to it, over the links that close no cycle; a node nothing points
 * at sits just above the first node it points at, so its links cross no layer.
 */
function layersOf(ids: string[], links: Link[]): Map<string, number> {
  const closing = cycleLinks(ids, links);
  const forward = links.filter((link) => !closing.has(linkKey(link)));
  const layer = new Map(ids.map((id) => [id, 0]));
  // As many rounds as nodes: the longest path has fewer links.
  for (const _round of ids) {
    for (const link of forward) {
      layer.set(link.to, Math.max(layer.get(link.to) ?? 0, (layer.get(link.from) ?? 0) + 1));
    }
  }
  for (const id of ids) {
    const below = forward.filter((link) => link.from === id).map((link) => layer.get(link.to) ?? 0);
    if (below.length > 0 && !forward.some((link) => link.to === id)) {
      layer.set(id, Math.min(...below) - 1);
    }
  }
  return layer;
}

/** The layers' nodes, each layer after the first ordered by where the nodes it comes from sit. */
function orderedRows(ids: string[], links: Link[]): string[][] {
  const layer = layersOf(ids, links);
  const rows: string[][] = [];
  for (const id of ids) {
    const at = layer.get(id) ?? 0;
    rows[at] = [...(rows[at] ?? []), id];
  }
  const position = new Map<string, number>();
  return rows.map((row) => {
    const weight = (id: string): number => {
      const from = links.filter((l) => l.to === id).flatMap((l) => position.get(l.from) ?? []);
      return from.length === 0 ? row.indexOf(id) : from.reduce((a, b) => a + b, 0) / from.length;
    };
    const sorted = row.toSorted((a, b) => weight(a) - weight(b));
    for (const [at, id] of sorted.entries()) {
      position.set(id, at);
    }
    return sorted;
  });
}

export function layoutFlow(ids: string[], links: Link[]): FlowLayout {
  const rows = orderedRows(ids, links);
  const widest = Math.max(1, ...rows.map((row) => row.length));
  const width = widest * NODE_WIDTH + (widest - 1) * GAP_X;
  const at = new Map<string, { x: number; y: number }>();
  for (const [layer, row] of rows.entries()) {
    const rowWidth = row.length * NODE_WIDTH + (row.length - 1) * GAP_X;
    for (const [index, id] of row.entries()) {
      const x = (width - rowWidth) / 2 + index * (NODE_WIDTH + GAP_X);
      at.set(id, { x, y: layer * (NODE_HEIGHT + GAP_Y) });
    }
  }
  const height = rows.length * NODE_HEIGHT + Math.max(0, rows.length - 1) * GAP_Y;
  return { at, width, height };
}
