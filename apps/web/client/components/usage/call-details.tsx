// The agent calls of one row of a Usage table: each call's turns, time and peak context, then its models.
import type { UsageCall, UsageGroup, UsageModel } from '@union/core';
import type { ReactElement } from 'react';

import { costText, inputText, outputText, peakText } from '../../lib/usage-format';

const MS_PER_SECOND = 1000;

function callSummary(call: UsageCall, index: number): string {
  const parts = [`Call ${index + 1}`];
  if (call.turns !== null) {
    parts.push(`${call.turns} turn${call.turns === 1 ? '' : 's'}`);
  }
  if (call.durationMs !== null) {
    parts.push(`${Math.round(call.durationMs / MS_PER_SECOND)}s`);
  }
  return parts.join(' · ');
}

function ModelLine({ model }: { model: UsageModel }): ReactElement {
  return (
    <li className="flex flex-wrap gap-x-3">
      <span className="w-36 truncate">
        {model.model}
        {model.main ? '' : ' (subagents)'}
      </span>
      <span>in {inputText(model)}</span>
      <span>out {outputText(model)}</span>
      <span className="text-zinc-500">{costText(model.costUsd)}</span>
    </li>
  );
}

function CallLine({ call, index }: { call: UsageCall; index: number }): ReactElement {
  const peak = peakText(call.peakContext, call.contextWindow);
  return (
    <li>
      <p>
        <span className="font-medium">{callSummary(call, index)}</span>
        {peak ? (
          <span className={peak.high ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'}>
            {' · '}peak context {peak.text}
          </span>
        ) : null}
        {call.failed ? <span className="text-red-600 dark:text-red-400"> · failed</span> : null}
      </p>
      <ul className="ml-4 text-zinc-600 dark:text-zinc-400">
        {call.models.map((model) => (
          <ModelLine key={model.model} model={model} />
        ))}
      </ul>
    </li>
  );
}

export function CallDetails({ group }: { group: UsageGroup }): ReactElement {
  return (
    <ul className="space-y-1 py-1">
      {group.calls.map((call, index) => (
        <CallLine key={call.id} call={call} index={index} />
      ))}
    </ul>
  );
}
