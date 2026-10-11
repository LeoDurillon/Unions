/**
 * The intake step ends its questions with an `Answer:` line for the user to fill in. These helpers
 * find those lines so the UI can show an input box in their place, then write the answers back
 * into the markdown (the later steps read the answers from there).
 */

export type Segment =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'answer'; key: string; slot: number; value: string };

const ANSWER_LINE = /^(?<prefix>\s*(?:[-*]\s+)?(?:\*\*)?Answer:(?:\*\*)?)[ \t]*(?<value>.*)$/u;
const FENCE = /^\s*(?:```|~~~)/u;

type Slot = { line: number; prefix: string; value: string };

function findSlots(lines: string[]): Slot[] {
  const slots: Slot[] = [];
  let inFence = false;
  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    } else {
      const match = inFence ? null : ANSWER_LINE.exec(line);
      if (match?.groups) {
        slots.push({
          line: index,
          prefix: match.groups.prefix ?? 'Answer:',
          value: match.groups.value ?? '',
        });
      }
    }
  }
  return slots;
}

export function splitAnswers(markdown: string): Segment[] {
  const lines = markdown.split('\n');
  const segments: Segment[] = [];
  let start = 0;
  for (const [index, slot] of findSlots(lines).entries()) {
    const text = lines.slice(start, slot.line).join('\n');
    if (text.trim() !== '') {
      segments.push({ kind: 'text', key: `text-${start}`, text });
    }
    segments.push({
      kind: 'answer',
      key: `answer-${index}`,
      slot: index,
      value: slot.value.trim(),
    });
    start = slot.line + 1;
  }
  const rest = lines.slice(start).join('\n');
  if (rest.trim() !== '') {
    segments.push({ kind: 'text', key: `text-${start}`, text: rest });
  }
  return segments;
}

/** Writes `answers[i]` into the i-th `Answer:` line, keeping its indentation and markup. */
export function fillAnswers(markdown: string, answers: readonly string[]): string {
  const lines = markdown.split('\n');
  for (const [index, slot] of findSlots(lines).entries()) {
    const value = (answers[index] ?? slot.value).replaceAll(/\s*\n\s*/gu, ' ').trim();
    lines[slot.line] = value === '' ? slot.prefix : `${slot.prefix} ${value}`;
  }
  return lines.join('\n');
}

export function answersOf(segments: readonly Segment[]): string[] {
  return segments.flatMap((segment) => (segment.kind === 'answer' ? [segment.value] : []));
}
