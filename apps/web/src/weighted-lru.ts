// A least-recently-used map bounded by the summed weight of its values (bytes, or a count).

/** Least recently used first out, bounded by the summed weight of its values. */
export class WeightedLru<T> {
  private readonly entries = new Map<string, { value: T; weight: number }>();
  private total = 0;

  constructor(
    private readonly limit: number,
    private readonly weigh: (value: T) => number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    const weight = this.weigh(value);
    if (weight > this.limit) {
      return;
    }
    const old = this.entries.get(key);
    if (old) {
      this.total -= old.weight;
      this.entries.delete(key);
    }
    this.entries.set(key, { value, weight });
    this.total += weight;
    for (const [oldest, entry] of this.entries) {
      if (this.total <= this.limit) {
        break;
      }
      this.entries.delete(oldest);
      this.total -= entry.weight;
    }
  }
}
