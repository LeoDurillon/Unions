// What needs the reviewer, at the top of the spec report: the items in the report's order, each with its
// lines and a draft comment to start on them; or a word that nothing does.
import type { AttentionItem, AttentionKind, ReviewReportResult } from '@union/core';
import { ATTENTION_LABELS } from '@union/core/review-report-markdown';
import type { ReactElement } from 'react';

import type { Tone } from '../../lib/labels';
import type { ReviewTarget } from '../../lib/review-target';
import { Badge } from '../ui';
import { NotUseful } from './report-not-useful';
import { byFile, DraftButton, FileRef, type OpenLines } from './report-open';
import { ReportSection, ROWS_CLASS } from './report-sections';

const KIND_TONES: Record<AttentionKind, Tone> = {
  differs: 'red',
  missing: 'red',
  partial: 'amber',
  unasked: 'amber',
  risk: 'amber',
  question: 'blue',
};

function Item({
  target,
  item,
  index,
  onOpen,
}: {
  target: ReviewTarget;
  item: AttentionItem;
  /** Its place in the report's list, from 0: numbers stay when items are hidden. */
  index: number;
  onOpen: OpenLines;
}): ReactElement {
  const [first] = item.cites;
  return (
    <li className="flex gap-3 px-3 py-2">
      <span className="w-4 shrink-0 text-right text-zinc-400 tabular-nums">{index + 1}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Badge tone={KIND_TONES[item.kind]}>{ATTENTION_LABELS[item.kind]}</Badge>
          <span className="min-w-0 flex-1 font-medium">{item.title}</span>
          {first ? (
            <DraftButton
              cite={first}
              draft={item.detail === '' ? item.title : `${item.title}: ${item.detail}`}
              onOpen={onOpen}
            />
          ) : null}
        </div>
        {item.detail === '' ? null : (
          <p className="text-zinc-600 dark:text-zinc-400">{item.detail}</p>
        )}
        {byFile(item.cites).map((file) => (
          <FileRef key={file.path} path={file.path} lines={file.lines} onOpen={onOpen} />
        ))}
        <NotUseful target={target} index={index} item={item} />
      </div>
    </li>
  );
}

function hiddenNote(count: number): string {
  return count === 1 ? '1 item marked not useful.' : `${count} items marked not useful.`;
}

export function ReportAttention({
  target,
  result,
  onOpen,
}: {
  target: ReviewTarget;
  result: ReviewReportResult;
  onOpen: OpenLines;
}): ReactElement | null {
  const shown = result.attention.flatMap((item, index) =>
    item.notUseful ? [] : [{ item, index }],
  );
  const hidden = result.attention.length - shown.length;
  const note = hidden === 0 ? null : <p className="text-xs text-zinc-500">{hiddenNote(hidden)}</p>;
  if (shown.length === 0) {
    return result.verdict === 'matches' ? (
      <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
        Nothing needs you: the change does what the specs ask. Skim it and approve.
      </p>
    ) : (
      note
    );
  }
  return (
    <ReportSection id="report-attention" title="Needs you" count={shown.length}>
      <ol className={ROWS_CLASS}>
        {shown.map(({ item, index }) => (
          <Item
            key={`${item.kind}:${item.title}`}
            target={target}
            item={item}
            index={index}
            onOpen={onOpen}
          />
        ))}
      </ol>
      {note}
    </ReportSection>
  );
}
