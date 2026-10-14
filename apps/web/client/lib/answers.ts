/**
 * The intake step ends its questions with an `Answer:` line for the user to fill in. These helpers
 * find those lines so the UI can show an input box in their place, then write the answers back
 * into the markdown (the later steps read the answers from there). An answer of several lines
 * continues on the lines below, indented two spaces past its `Answer:`: they stay in the same list
 * item, and are read back as the same answer.
 */

export type Segment =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'answer'; key: string; slot: number; value: string };

const ANSWER_LINE = /^(?<prefix>\s*(?:[-*]\s+)?(?:\*\*)?Answer:(?:\*\*)?)[ \t]*(?<value>.*)$/u;
const FENCE = /^\s*(?:```|~~~)/u;

/** `line` to `end` (inclusive): the `Answer:` line and its continuation lines. */
type Slot = { line: number; end: number; prefix: string; value: string };

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** The lines after an `Answer:` line that continue it: not blank, indented further, not another answer. */
function continuation(lines: string[], at: number): string[] {
  const own = indentOf(lines[at] ?? '');
  const found: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '' || indentOf(line) <= own || FENCE.test(line) || ANSWER_LINE.test(line)) {
      break;
    }
    found.push(line.trim());
  }
  return found;
}

function findSlots(lines: string[]): Slot[] {
  const slots: Slot[] = [];
  let inFence = false;
  let skipTo = -1;
  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    } else {
      const match = inFence || index <= skipTo ? null : ANSWER_LINE.exec(line);
      if (match?.groups) {
        const more = continuation(lines, index);
        const first = (match.groups.value ?? '').trim();
        slots.push({
          line: index,
          end: index + more.length,
          prefix: match.groups.prefix ?? 'Answer:',
          value: [first, ...more].filter((part) => part !== '').join('\n'),
        });
        skipTo = index + more.length;
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
      value: slot.value,
    });
    start = slot.end + 1;
  }
  const rest = lines.slice(start).join('\n');
  if (rest.trim() !== '') {
    segments.push({ kind: 'text', key: `text-${start}`, text: rest });
  }
  return segments;
}

/** An answer's lines: its first on the `Answer:` line, the others indented under it. */
function answerLines(slot: Slot, answer: string): string[] {
  const [first = '', ...rest] = answer
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const indent = ' '.repeat(indentOf(slot.prefix) + 2);
  return [
    first === '' ? slot.prefix : `${slot.prefix} ${first}`,
    ...rest.map((line) => `${indent}${line}`),
  ];
}

/** Writes `answers[i]` into the i-th `Answer:` line, keeping its indentation and markup. */
export function fillAnswers(markdown: string, answers: readonly string[]): string {
  const lines = markdown.split('\n');
  // From the last: replacing a slot's lines moves the ones after it.
  for (const [index, slot] of [...findSlots(lines).entries()].toReversed()) {
    lines.splice(
      slot.line,
      slot.end - slot.line + 1,
      ...answerLines(slot, answers[index] ?? slot.value),
    );
  }
  return lines.join('\n');
}

export function answersOf(segments: readonly Segment[]): string[] {
  return segments.flatMap((segment) => (segment.kind === 'answer' ? [segment.value] : []));
}
