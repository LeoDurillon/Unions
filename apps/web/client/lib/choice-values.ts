/**
 * A multi-select rule value is its option names joined by commas (Notion option names cannot hold
 * one); the worker splits it the same way.
 */
export function splitChoices(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

export function joinChoices(names: string[]): string {
  return [...new Set(names)].join(', ');
}

/** The value's names that are Notion options, and the others (variables, names Notion lacks). */
export function partitionChoices(
  value: string,
  options: string[],
): { picked: string[]; other: string[] } {
  const names = splitChoices(value);
  return {
    picked: names.filter((name) => options.includes(name)),
    other: names.filter((name) => !options.includes(name)),
  };
}
