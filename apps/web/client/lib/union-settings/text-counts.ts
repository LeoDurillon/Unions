// How long a prompt is, as its editor says it: "42 lines · 610 words".

/** Lines and words of a text; an empty text has none of either. */
export function textCounts(text: string): { lines: number; words: number } {
  if (text.trim() === '') {
    return { lines: 0, words: 0 };
  }
  return {
    lines: text.replace(/\n$/u, '').split('\n').length,
    words: text.split(/\s+/u).filter((word) => word !== '').length,
  };
}

/** "1 line · 3 words", "42 lines · 610 words". */
export function countsText(text: string): string {
  const { lines, words } = textCounts(text);
  return `${lines} line${lines === 1 ? '' : 's'} · ${words} word${words === 1 ? '' : 's'}`;
}
