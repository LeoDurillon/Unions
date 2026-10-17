// A table of runs with what their agent calls used (input, output, API-equivalent cost); a row opens to its calls.
import type { UsageGroup, UsageTotals } from '@union/core';
import { useState, type ReactElement, type ReactNode } from 'react';

import { costText, inputText, outputText } from '../../lib/usage-format';
import { CallDetails } from './call-details';

/** The row's own cells (run, step…), and the calls it groups, if any. */
export type UsageRow = { key: string; cells: ReactNode[]; group: UsageGroup | undefined };

/** In, Out, Cost. */
const USAGE_COLUMNS = 3;
const COST_TITLE = 'API-equivalent price of these tokens: not billed on a Max subscription';

function UsageCells({ total }: { total: UsageTotals | undefined }): ReactElement {
  if (!total) {
    return (
      <td colSpan={USAGE_COLUMNS} className="text-zinc-500">
        –
      </td>
    );
  }
  return (
    <>
      <td>{inputText(total)}</td>
      <td>{outputText(total)}</td>
      <td className="text-zinc-500">{costText(total.costUsd)}</td>
    </>
  );
}

function Row({ row, columns }: { row: UsageRow; columns: string[] }): ReactElement {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = row.cells;
  const { group } = row;
  return (
    <>
      <tr className="border-t border-zinc-200 dark:border-zinc-800">
        <td className="py-1">
          {group ? (
            <button
              type="button"
              aria-expanded={open}
              className="cursor-pointer"
              onClick={() => {
                setOpen(!open);
              }}
            >
              <span aria-hidden className="inline-block w-3 text-zinc-500">
                {open ? '▾' : '▸'}
              </span>
              {first}
            </button>
          ) : (
            <span className="pl-3">{first}</span>
          )}
        </td>
        {rest.map((cell, index) => (
          <td key={columns[index + 1]}>{cell}</td>
        ))}
        <UsageCells total={group?.total} />
      </tr>
      {open && group ? (
        <tr>
          <td colSpan={columns.length + USAGE_COLUMNS} className="pl-3">
            <CallDetails group={group} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function UsageTable({
  columns,
  rows,
  total,
}: {
  columns: string[];
  rows: UsageRow[];
  total: UsageTotals | undefined;
}): ReactElement {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-zinc-500">
        <tr>
          {columns.map((column, index) => (
            <th key={column} className={index === 0 ? 'py-1 pl-3' : undefined}>
              {column}
            </th>
          ))}
          <th>In</th>
          <th>Out</th>
          <th title={COST_TITLE}>Cost (API)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Row key={row.key} row={row} columns={columns} />
        ))}
        {total && total.calls > 0 ? (
          <tr className="border-t border-zinc-300 font-medium dark:border-zinc-700">
            <td colSpan={columns.length} className="py-1 pl-3">
              Total · {total.calls} call{total.calls === 1 ? '' : 's'}
            </td>
            <UsageCells total={total} />
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
