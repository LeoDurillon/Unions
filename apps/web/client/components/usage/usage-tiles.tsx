// The Usage tab's totals over its range: API-equivalent cost, agent calls (and the model most ran on), tokens in
// and out.

import type { UsageSlice } from '@union/core';
import type { ReactElement } from 'react';

import { count } from '../../lib/log/token-counts';
import { costText } from '../../lib/usage/usage-format';
import { topModel } from '../../lib/usage/usage-shares';

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): ReactElement {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {note ? <div className="text-xs text-zinc-500">{note}</div> : null}
    </div>
  );
}

export function Tiles({
  total,
  models,
}: {
  total: UsageSlice;
  /** The split per model, for the model most calls ran on. */
  models: { model: string; calls: number }[];
}): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="API-equivalent cost" value={costText(total.costUsd)} note="Not billed on Max" />
      <Tile label="Agent calls" value={String(total.calls)} note={topModel(models) ?? undefined} />
      <Tile label="Tokens in" value={count(total.input)} note="Cache reads included" />
      <Tile label="Tokens out" value={count(total.output)} />
    </div>
  );
}
