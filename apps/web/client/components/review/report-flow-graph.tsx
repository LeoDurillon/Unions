// The spec report's map of how the change works, drawn: nodes in layers (the changed ones highlighted,
// the others grey and dashed), the links between them with how, and the numbers of what needs the
// reviewer on the nodes it points at; a changed node opens its lines in the diff.
import type { FlowEdge, FlowNode, ReportFlow } from '@union/core';
import type { ReactElement } from 'react';

import { layoutFlow, NODE_HEIGHT, NODE_WIDTH, type FlowLayout } from '../../lib/flow-layout';
import type { OpenLines } from './report-open';

/** Room around the map, so the outer nodes' borders are not cut. */
const PAD = 4;
const LABEL_WIDTH = 168;
const LABEL_HEIGHT = 18;
const MIN_BEND = 24;
/**
 * How far along its link a label sits: nearer the source when the target has other links in, nearer
 * the target when the source has other links out, so labels of links meeting at a node part.
 */
const LABEL_NEAR = 0.25;
const LABEL_MIDDLE = 0.5;

function labelAt(edge: FlowEdge, edges: FlowEdge[]): number {
  const into = edges.filter((other) => other.to === edge.to).length;
  const out = edges.filter((other) => other.from === edge.from).length;
  if (into > 1 && out <= 1) {
    return LABEL_NEAR;
  }
  return out > 1 && into <= 1 ? 1 - LABEL_NEAR : LABEL_MIDDLE;
}

/** The middle weights of a cubic Bézier curve. */
const BERNSTEIN = 3;

type Point = { x: number; y: number };

/** The point at `t` (0 to 1) of the cubic Bézier curve through `p`. */
function along(p: [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  const weights = [u * u * u, BERNSTEIN * u * u * t, BERNSTEIN * u * t * t, t * t * t];
  return {
    x: p.reduce((sum, point, at) => sum + (weights[at] ?? 0) * point.x, 0),
    y: p.reduce((sum, point, at) => sum + (weights[at] ?? 0) * point.y, 0),
  };
}

function Link({
  edge,
  edges,
  layout,
}: {
  edge: FlowEdge;
  edges: FlowEdge[];
  layout: FlowLayout;
}): ReactElement | null {
  const from = layout.at.get(edge.from);
  const to = layout.at.get(edge.to);
  if (!from || !to) {
    return null;
  }
  const [x1, y1] = [from.x + NODE_WIDTH / 2, from.y + NODE_HEIGHT];
  const [x2, y2] = [to.x + NODE_WIDTH / 2, to.y];
  const bend = Math.max(MIN_BEND, Math.abs(y2 - y1) / 2);
  const path = `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
  const label = along(
    [
      { x: x1, y: y1 },
      { x: x1, y: y1 + bend },
      { x: x2, y: y2 - bend },
      { x: x2, y: y2 },
    ],
    labelAt(edge, edges),
  );
  return (
    <g>
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        markerEnd="url(#flow-arrow)"
        className="stroke-zinc-400 dark:stroke-zinc-600"
      />
      {edge.label === '' ? null : (
        <foreignObject
          x={label.x - LABEL_WIDTH / 2}
          y={label.y - LABEL_HEIGHT / 2}
          width={LABEL_WIDTH}
          height={LABEL_HEIGHT}
        >
          <div className="flex h-full justify-center">
            <span
              title={edge.label}
              className="truncate rounded bg-white px-1 text-[10px] leading-[18px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
            >
              {edge.label}
            </span>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

function NodeText({ node, marks }: { node: FlowNode; marks: number[] }): ReactElement {
  return (
    <>
      <span className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{node.label}</span>
        {marks.length > 0 ? (
          <span
            title="What needs you points here"
            className="shrink-0 rounded-full bg-red-100 px-1.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {marks.join(' · ')}
          </span>
        ) : null}
      </span>
      <span className="block truncate font-mono text-[10px] text-zinc-500">
        {node.path.split('/').at(-1)}
        {node.changed ? '' : ' · not changed'}
      </span>
    </>
  );
}

function Node({
  node,
  marks,
  layout,
  onOpen,
}: {
  node: FlowNode;
  marks: number[];
  layout: FlowLayout;
  onOpen: OpenLines;
}): ReactElement | null {
  const at = layout.at.get(node.id);
  if (!at) {
    return null;
  }
  const box = 'h-full w-full rounded-md border px-2 py-1 text-left';
  return (
    <foreignObject x={at.x} y={at.y} width={NODE_WIDTH} height={NODE_HEIGHT}>
      {node.changed ? (
        <button
          type="button"
          title={`${node.path}: open in the diff`}
          className={`${box} border-indigo-300 bg-indigo-50 hover:border-indigo-500 dark:border-indigo-800 dark:bg-indigo-950/60`}
          onClick={() => {
            onOpen(node.path, node.lines ?? undefined);
          }}
        >
          <NodeText node={node} marks={marks} />
        </button>
      ) : (
        <div
          title={`${node.path} (not changed)`}
          className={`${box} border-dashed border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900`}
        >
          <NodeText node={node} marks={marks} />
        </div>
      )}
    </foreignObject>
  );
}

export function FlowGraph({
  flow,
  marks,
  onOpen,
}: {
  flow: ReportFlow;
  /** The numbers of what needs the reviewer, by node id. */
  marks: ReadonlyMap<string, number[]>;
  onOpen: OpenLines;
}): ReactElement {
  const layout = layoutFlow(
    flow.nodes.map((node) => node.id),
    flow.edges,
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <svg
        width={layout.width + 2 * PAD}
        height={layout.height + 2 * PAD}
        viewBox={`${-PAD} ${-PAD} ${layout.width + 2 * PAD} ${layout.height + 2 * PAD}`}
        className="mx-auto block"
      >
        <defs>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-zinc-400 dark:fill-zinc-600" />
          </marker>
        </defs>
        {flow.edges.map((edge) => (
          <Link key={`${edge.from}\n${edge.to}`} edge={edge} edges={flow.edges} layout={layout} />
        ))}
        {flow.nodes.map((node) => (
          <Node
            key={node.id}
            node={node}
            marks={marks.get(node.id) ?? []}
            layout={layout}
            onOpen={onOpen}
          />
        ))}
      </svg>
    </div>
  );
}
