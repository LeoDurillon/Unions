// The project's size settings: the paths left out of a change's lines of code. Also the budget of a
// ticket whose plan gives no estimate, and the size above which an agent review is offered in slices.
import type { ProjectConfig } from '@union/core';

import { BAD_REQUEST, fail } from '../http';

export const SIZE_FIELDS = ['sizeIgnore', 'sizeBudget', 'sliceReviewAbove'] as const;

const MAX_PATTERNS = 100;
const MAX_BUDGET = 100_000;

/** A list replaces the patterns; null brings back the defaults. */
function ignoreChange(value: unknown): string[] | undefined {
  if (value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw fail(BAD_REQUEST, '"sizeIgnore" must be a list of patterns, or null');
  }
  const patterns = value.map((item: string) => item.trim()).filter((item) => item !== '');
  if (patterns.length > MAX_PATTERNS) {
    throw fail(BAD_REQUEST, `At most ${MAX_PATTERNS} size patterns`);
  }
  return patterns;
}

/** A whole number of lines; null removes the budget. */
function budgetChange(value: unknown): number | undefined {
  if (value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_BUDGET) {
    throw fail(BAD_REQUEST, `"sizeBudget" must be a whole number from 1 to ${MAX_BUDGET}, or null`);
  }
  return value;
}

/** A whole number of changed lines, 0 to never slice; null brings back the default. */
function sliceChange(value: unknown): number | undefined {
  if (value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_BUDGET) {
    throw fail(
      BAD_REQUEST,
      `"sliceReviewAbove" must be a whole number from 0 to ${MAX_BUDGET}, or null`,
    );
  }
  return value;
}

/** The size settings a request changes; an absent key keeps the current value. */
export function sizeChange(
  body: Record<string, unknown>,
  config: ProjectConfig,
): Pick<ProjectConfig, (typeof SIZE_FIELDS)[number]> {
  return {
    sizeIgnore: 'sizeIgnore' in body ? ignoreChange(body.sizeIgnore) : config.sizeIgnore,
    sizeBudget: 'sizeBudget' in body ? budgetChange(body.sizeBudget) : config.sizeBudget,
    sliceReviewAbove:
      'sliceReviewAbove' in body ? sliceChange(body.sliceReviewAbove) : config.sliceReviewAbove,
  };
}
