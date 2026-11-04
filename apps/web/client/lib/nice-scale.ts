// A chart's value axis: a round top just above the largest value, and the ticks up to it.

const BASE = 10;
const HALF = 5;
const QUARTER = 2.5;
/** The round steps of one power of ten. */
const STEPS = [1, 2, QUARTER, HALF, BASE];

/** About `count` round ticks from 0 to just above `max` (0, 50, 100, 150…); [0, 1] for nothing. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) {
    return [0, 1];
  }
  const rough = max / count;
  const magnitude = BASE ** Math.floor(Math.log10(rough));
  const step = (STEPS.find((candidate) => candidate * magnitude >= rough) ?? BASE) * magnitude;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
}
