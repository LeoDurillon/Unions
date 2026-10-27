// The report's map of how the change works, read from the agent's block: nodes on paths of the
// checkout, edges between them, and a walkthrough whose every why is checked against the source it
// names (a spec, a commit message, a comment the diff adds), else marked inferred.
import {
  quoteKey,
  WHY_SOURCES,
  type FlowEdge,
  type FlowNode,
  type FlowStep,
  type ReportFlow,
  type ReportSpec,
  type WhySource,
} from '@union/core';

import { isRecord } from './json-block';
import { oneOf, pathOf, rangeOf, records, text, texts } from './review-report-fields';
import { MAX_FLOW_EDGES, MAX_FLOW_NODES, MAX_FLOW_STEPS } from './review-report-format';

/** What a step's quote is looked for in: the specs sent, the change's commit messages, its diff. */
export type WhyTexts = {
  specs: ReportSpec[];
  commits: string;
  files: { path: string; patch: string }[];
};

/** The flow and how much of it could not be kept. */
type ReadFlow = { flow: ReportFlow; dropped: number };

function nodesOf(value: unknown, changed: ReadonlySet<string>): FlowNode[] {
  const nodes: FlowNode[] = [];
  for (const item of records(value)) {
    const id = text(item.id);
    const path = pathOf(item.path);
    if (id !== '' && path !== null && !nodes.some((node) => node.id === id)) {
      const lines = isRecord(item.lines) ? rangeOf(item.lines.start, item.lines.end) : null;
      const label = text(item.label) || (path.split('/').at(-1) ?? path);
      nodes.push({ id, label, path, lines, changed: changed.has(path) });
    }
  }
  return nodes.slice(0, MAX_FLOW_NODES);
}

function edgesOf(value: unknown, ids: ReadonlySet<string>): FlowEdge[] {
  const seen = new Set<string>();
  const edges = records(value).flatMap((item): FlowEdge[] => {
    const from = text(item.from);
    const to = text(item.to);
    const key = `${from}\n${to}`;
    if (!ids.has(from) || !ids.has(to) || from === to || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{ from, to, label: text(item.label) }];
  });
  return edges.slice(0, MAX_FLOW_EDGES);
}

/** The diff's added and kept lines, without their markers and comment signs. */
function diffText(files: WhyTexts['files']): string {
  return files
    .flatMap((file) => file.patch.split('\n').filter((line) => !line.startsWith('-')))
    .map((line) => line.slice(1).replaceAll(/\/\/|#|\/\*|\*\//gu, ' '))
    .join('\n');
}

/** Whether a quote (as `quoteKey` reads it) is in the source a why names. */
const IN_SOURCE: Record<WhySource, (key: string, sources: WhyTexts) => boolean> = {
  spec: (key, sources) => sources.specs.some((spec) => quoteKey(spec.text).includes(key)),
  commit: (key, sources) => quoteKey(sources.commits).includes(key),
  comment: (key, sources) => quoteKey(diffText(sources.files)).includes(key),
  inferred: () => false,
};

/** A step, its why's source kept only when its quote is found there; `lost` when it was not. */
function stepOf(
  item: Record<string, unknown>,
  ids: ReadonlySet<string>,
  sources: WhyTexts,
): { step: FlowStep; lost: boolean } {
  const said = oneOf(WHY_SOURCES, item.source) ?? 'inferred';
  const quote = text(item.quote);
  const checked = quote !== '' && IN_SOURCE[said](quoteKey(quote), sources);
  const step: FlowStep = {
    title: text(item.title),
    what: text(item.what),
    why: text(item.why),
    source: checked ? said : 'inferred',
    quote: checked ? quote : null,
    nodes: texts(item.nodes).filter((id) => ids.has(id)),
  };
  return { step, lost: said !== 'inferred' && !checked };
}

/** The agent's flow, checked; empty when it gave none. */
export function flowOf(value: unknown, changed: ReadonlySet<string>, sources: WhyTexts): ReadFlow {
  const flow = isRecord(value) ? value : {};
  const nodes = nodesOf(flow.nodes, changed);
  const ids = new Set(nodes.map((node) => node.id));
  const read = records(flow.steps)
    .filter((item) => text(item.title) !== '' || text(item.what) !== '')
    .slice(0, MAX_FLOW_STEPS)
    .map((item) => stepOf(item, ids, sources));
  return {
    flow: { nodes, edges: edgesOf(flow.edges, ids), steps: read.map((item) => item.step) },
    dropped: read.filter((item) => item.lost).length,
  };
}
