// A count with its noun in the right number: "1 file", "2 files".

/** `count` and `word`, the word made plural (`many`, else `word` + "s") unless the count is 1. */
export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}
