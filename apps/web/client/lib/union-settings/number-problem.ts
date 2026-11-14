// Checks a whole-number setting as typed against its bounds. Save is refused with the reason before the
// server is asked.

type Bounds = { readonly min: number; readonly max: number };

/** The typed text as a number: NaN when empty or not a number, so an emptied field is not 0. */
export function parseTyped(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

/** Why `value` cannot be saved for the field `label`, or null when it is a whole number within bounds. */
export function numberProblem(label: string, value: number, bounds: Bounds): string | null {
  if (Number.isNaN(value)) {
    return `${label}: enter a number.`;
  }
  if (!Number.isInteger(value)) {
    return `${label}: enter a whole number.`;
  }
  if (value < bounds.min || value > bounds.max) {
    return `${label}: enter a number from ${bounds.min} to ${bounds.max}.`;
  }
  return null;
}

/** The first field's reason it cannot be saved, or null when all can. */
export function firstNumberProblem(
  fields: readonly { label: string; value: number; bounds: Bounds }[],
): string | null {
  for (const field of fields) {
    const problem = numberProblem(field.label, field.value, field.bounds);
    if (problem !== null) {
      return problem;
    }
  }
  return null;
}
