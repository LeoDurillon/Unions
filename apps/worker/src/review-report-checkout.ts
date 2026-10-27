// Reads what the report is checked against in the container: the files it names must exist (a deleted
// file of the change aside), its line ranges are cut to the file's length; and the change's commit
// messages.
import type { ContainerRuntime, ReportFlow, ReportLines, ReviewReportResult } from '@union/core';

import { runIn } from './container-exec';
import { REPO_DIR } from './provision';

/** Each path read from stdin that is a file, with its number of lines (a last line without `\n` counts). */
const LINE_COUNTS = String.raw`while IFS= read -r p; do [ -f "$p" ] && printf "%s\t%s\n" "$p" "$(awk 'END { print NR }' "$p")"; done; true`;

/** The files of the checkout among `paths`, with their number of lines. */
export async function lineCounts(
  runtime: ContainerRuntime,
  container: string,
  paths: string[],
): Promise<Map<string, number>> {
  if (paths.length === 0) {
    return new Map();
  }
  const out = await runIn(runtime, container, ['sh', '-c', LINE_COUNTS], {
    cwd: REPO_DIR,
    stdin: `${[...new Set(paths)].join('\n')}\n`,
  });
  return new Map(
    out.stdout.split('\n').flatMap((line) => {
      const [path = '', count = ''] = line.split('\t');
      return path === '' ? [] : [[path, Number(count)] as const];
    }),
  );
}

/** The change's commit messages (`base..HEAD`); empty when git cannot read them. */
export async function commitMessages(
  runtime: ContainerRuntime,
  container: string,
  base: string,
): Promise<string> {
  const out = await runIn(runtime, container, ['git', 'log', '--format=%B', `${base}..HEAD`], {
    cwd: REPO_DIR,
  });
  return out.exitCode === 0 ? out.stdout : '';
}

/** Every path the report names, to look for in the checkout. */
export function reportPaths(result: ReviewReportResult): string[] {
  return [
    ...result.importantFiles.map((file) => file.path),
    ...result.flow.nodes.map((node) => node.path),
    ...result.attention.flatMap((item) => item.cites.map((cite) => cite.path)),
    ...result.requirements.flatMap((item) => [...item.evidence.map((e) => e.path), ...item.tests]),
    ...result.risks.flatMap((risk) => risk.paths),
    ...result.docs.map((doc) => doc.path),
  ];
}

/** The range cut to a file of `count` lines; null when it starts after the end. */
function within<T extends ReportLines>(range: T, count: number): T | null {
  return range.start > count ? null : { ...range, end: Math.min(range.end, count) };
}

function counted<T>(items: T[], kept: T[]): number {
  return items.length - kept.length;
}

/** The flow without the nodes that are neither changed nor files, their lines cut to the file. */
function flowInCheckout(
  flow: ReportFlow,
  counts: ReadonlyMap<string, number>,
  changed: ReadonlySet<string>,
): ReportFlow {
  const nodes = flow.nodes.flatMap((node) => {
    if (!counts.has(node.path) && !changed.has(node.path)) {
      return [];
    }
    const lines = node.lines ? within(node.lines, counts.get(node.path) ?? 0) : null;
    return [{ ...node, lines }];
  });
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: flow.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
    steps: flow.steps.map((step) => ({ ...step, nodes: step.nodes.filter((id) => ids.has(id)) })),
  };
}

/**
 * The report with what the checkout cannot back dropped and counted: code, tests, docs and lines to
 * look at that are not files, line ranges past a file's end, an unchanged important file that does
 * not exist.
 */
export function keepInCheckout(
  result: ReviewReportResult,
  counts: ReadonlyMap<string, number>,
  changed: ReadonlySet<string>,
): ReviewReportResult {
  let dropped = 0;
  const requirements = result.requirements.map((item) => {
    const evidence = item.evidence.flatMap((e) => within(e, counts.get(e.path) ?? 0) ?? []);
    const tests = item.tests.filter((path) => counts.has(path));
    dropped += counted(item.evidence, evidence) + counted(item.tests, tests);
    return { ...item, evidence, tests };
  });
  const attention = result.attention.map((item) => {
    const cites = item.cites.flatMap((cite) => within(cite, counts.get(cite.path) ?? 0) ?? []);
    dropped += counted(item.cites, cites);
    return { ...item, cites };
  });
  const importantFiles = result.importantFiles.filter(
    (file) => counts.has(file.path) || changed.has(file.path),
  );
  for (const file of importantFiles) {
    // The result is the run's own copy: its line ranges are cut in place.
    const count = counts.get(file.path) ?? 0;
    file.lines = file.lines.flatMap((range) => within(range, count) ?? []);
  }
  const docs = result.docs.filter((doc) => counts.has(doc.path));
  const flow = flowInCheckout(result.flow, counts, changed);
  const risks = result.risks.map((risk) => ({
    ...risk,
    paths: risk.paths.filter((path) => counts.has(path) || changed.has(path)),
  }));
  dropped +=
    counted(result.importantFiles, importantFiles) +
    counted(result.docs, docs) +
    counted(result.flow.nodes, flow.nodes);
  return {
    ...result,
    flow,
    attention,
    requirements,
    importantFiles,
    docs,
    risks,
    dropped: result.dropped + dropped,
  };
}
