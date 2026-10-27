// How the change works, near the top of the spec report: the map of its main path, numbered with what
// needs the reviewer, and the walkthrough, each step's why with where it comes from.
import type { FlowStep, ReportFlow, ReviewReportResult } from '@union/core';
import { plainQuote } from '@union/core/review-report-specs';
import type { ReactElement } from 'react';

import type { Tone } from '../../lib/labels';
import { Badge } from '../ui';
import { FlowGraph } from './report-flow-graph';
import type { OpenLines } from './report-open';
import { ReportSection, ROWS_CLASS } from './report-sections';

const SOURCES: Record<FlowStep['source'], { label: string; tone: Tone; title: string }> = {
  spec: { label: 'From the spec', tone: 'blue', title: 'Quoted from a spec, checked by Union' },
  commit: {
    label: 'From a commit',
    tone: 'green',
    title: 'Quoted from a commit message, checked by Union',
  },
  comment: {
    label: 'From a comment',
    tone: 'green',
    title: 'Quoted from a comment the change adds, checked by Union',
  },
  inferred: {
    label: 'Inferred',
    tone: 'neutral',
    title: "The agent's reading: nothing Union could check says it",
  },
};

/** The numbers of what needs the reviewer, on each node whose file an item points at. */
function marksOf(flow: ReportFlow, result: ReviewReportResult): Map<string, number[]> {
  return new Map(
    flow.nodes.map((node) => [
      node.id,
      result.attention.flatMap((item, at) =>
        !item.notUseful && item.cites.some((cite) => cite.path === node.path) ? [at + 1] : [],
      ),
    ]),
  );
}

function Step({
  step,
  position,
  flow,
  onOpen,
}: {
  step: FlowStep;
  position: number;
  flow: ReportFlow;
  onOpen: OpenLines;
}): ReactElement {
  const source = SOURCES[step.source];
  const nodes = flow.nodes.filter((node) => step.nodes.includes(node.id) && node.changed);
  return (
    <li className="flex gap-3 px-3 py-2">
      <span className="w-4 shrink-0 text-right text-zinc-400 tabular-nums">{position}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{step.title}</p>
        {step.what === '' ? null : <p>{step.what}</p>}
        {step.why === '' ? null : (
          <p className="text-zinc-600 dark:text-zinc-400">
            <Badge tone={source.tone} title={source.title}>
              {source.label}
            </Badge>{' '}
            {step.why}
          </p>
        )}
        {step.quote === null ? null : (
          <blockquote className="border-l-2 border-zinc-300 pl-3 text-xs whitespace-pre-wrap text-zinc-500 dark:border-zinc-700">
            {plainQuote(step.quote)}
          </blockquote>
        )}
        {nodes.length > 0 ? (
          <p className="flex flex-wrap gap-2">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                title={`${node.path}: open in the diff`}
                className="rounded bg-indigo-50 px-1.5 text-xs text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300"
                onClick={() => {
                  onOpen(node.path, node.lines ?? undefined);
                }}
              >
                {node.label}
              </button>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function ReportFlowSection({
  result,
  onOpen,
}: {
  result: ReviewReportResult;
  onOpen: OpenLines;
}): ReactElement {
  const { flow } = result;
  return (
    <ReportSection
      id="report-flow"
      title="How it works"
      count={flow.steps.length + flow.nodes.length}
      counted={false}
    >
      {flow.nodes.length > 0 ? (
        <FlowGraph flow={flow} marks={marksOf(flow, result)} onOpen={onOpen} />
      ) : null}
      {flow.steps.length > 0 ? (
        <ol className={ROWS_CLASS}>
          {flow.steps.map((step, at) => (
            <Step key={step.title} step={step} position={at + 1} flow={flow} onOpen={onOpen} />
          ))}
        </ol>
      ) : null}
    </ReportSection>
  );
}
