// The run slots that cap how many agents run at once, across the pipeline and the side runs.
/** Agent runs allowed at the same time, shared by the ticket scheduler and the investigations. */
export class RunSlots {
  private used = 0;

  /** `max`: read on every take, so a change of the setting applies to the next run. */
  constructor(private readonly max: number | (() => number)) {}

  tryTake(): boolean {
    const max = typeof this.max === 'number' ? this.max : this.max();
    if (this.used >= max) {
      return false;
    }
    this.used += 1;
    return true;
  }

  release(): void {
    this.used = Math.max(0, this.used - 1);
  }
}
