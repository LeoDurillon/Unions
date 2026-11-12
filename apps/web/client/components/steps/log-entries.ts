// Turns a Log's agent lines and events into its rows: tool calls with their results, the agent's words, run headers.

import type { CustomAgentNames, LogEntry } from '@union/core';
import { isEvent, type EventPayloads } from '@union/core/event-catalog';

import { stepTitle } from '../../lib/board/labels';
import { summarizeAgentEvent } from '../../lib/log/agent-events';
import { pairCalls } from '../../lib/log/log-calls';
import { formatWhen } from '../../lib/ui/relative-time';
import type { Entry } from './log-line';

type EventRow = Extract<LogEntry, { source: 'event' }>['event'];

type AgentReviewChange = EventPayloads['agent_review_changed'];

/** The review agent's runs on the ticket: a header when it starts, a line when it ends. */
function agentReviewEntries(key: string, { status, comments, error }: AgentReviewChange): Entry[] {
  if (status === 'running') {
    return [{ key, kind: 'run', text: 'Review comments · agent review' }];
  }
  if (status === 'succeeded') {
    const count = comments ?? 0;
    return [
      { key, kind: 'result', text: `${count} suggestion${count === 1 ? '' : 's'} added as drafts` },
    ];
  }
  if (status === 'failed') {
    return [{ key, kind: 'error', text: `Agent review failed: ${error ?? ''}` }];
  }
  return [];
}

/** An event rule applied to the ticket: what it set, or why not. */
function ruleEntries(
  key: string,
  { status, detail, error }: EventPayloads['event_rule_applied'],
): Entry[] {
  const text = `Event rule ${status}${detail ? `: ${detail}` : ''}${error ? ` (${error})` : ''}`;
  return [{ key, kind: status === 'failed' ? 'error' : 'result', text }];
}

function eventEntries(event: EventRow, names: CustomAgentNames): Entry[] {
  const key = `${event.seq}`;
  if (
    isEvent(event, 'preview_idle_stopped') ||
    isEvent(event, 'preview_reset') ||
    isEvent(event, 'preview_services_stopped') ||
    isEvent(event, 'ticket_workspace_removed')
  ) {
    return [{ key, kind: 'result', text: event.payload.message }];
  }
  if (isEvent(event, 'event_rule_applied')) {
    return ruleEntries(key, event.payload);
  }
  if (isEvent(event, 'agent_review_changed')) {
    return agentReviewEntries(key, event.payload);
  }
  if (isEvent(event, 'run_started')) {
    const text = `${stepTitle(event.payload.step, names)} · run #${event.runId ?? '?'}`;
    return [{ key, kind: 'run', text, runId: event.runId ?? undefined }];
  }
  if (isEvent(event, 'investigation_started')) {
    const time = formatWhen(event.at);
    return [{ key, kind: 'run', text: `Run started ${time}` }];
  }
  return [];
}

function entriesFor(entry: LogEntry, names: CustomAgentNames): Entry[] {
  if (entry.source === 'agent') {
    const { id, at, payload } = entry.line;
    return summarizeAgentEvent(payload).map((line, index) =>
      Object.assign(line, { key: `line-${id}-${index}`, at }),
    );
  }
  return eventEntries(entry.event, names).map((line) =>
    Object.assign(line, { at: entry.event.at }),
  );
}

/** The Log's rows: each agent line and event as entries, each tool result folded into its call. */
export function logEntries(entries: readonly LogEntry[], names: CustomAgentNames): Entry[] {
  return pairCalls(entries.flatMap((entry) => entriesFor(entry, names)));
}

/** The ticket runs the Log saw finish: the others still run. */
export function finishedRuns(entries: readonly LogEntry[]): ReadonlySet<number> {
  return new Set(
    entries.flatMap((entry) =>
      entry.source === 'event' && isEvent(entry.event, 'run_finished') && entry.event.runId !== null
        ? [entry.event.runId]
        : [],
    ),
  );
}
