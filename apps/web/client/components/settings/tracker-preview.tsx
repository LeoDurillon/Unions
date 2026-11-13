// A tracker action's preview on one ticket: what it would do on the item, with what only the run can check.
import type { ReactElement } from 'react';

import type { RulePreview } from '../../../src/event-api-types';

export function TrackerPreview({
  result,
}: {
  result: Extract<RulePreview, { kind: 'tracker' }>;
}): ReactElement {
  return (
    <div className="space-y-1 text-sm">
      <p>{result.title}</p>
      {result.lines.length > 0 ? (
        <ul className="list-inside list-disc">
          {result.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {result.text === null ? null : (
        <pre className="rounded bg-zinc-100 p-2 whitespace-pre-wrap dark:bg-zinc-800">
          {result.text === '' ? '(empty: nothing would be sent)' : result.text}
        </pre>
      )}
      {result.note === null ? null : <p className="text-xs text-zinc-500">{result.note}</p>}
    </div>
  );
}
