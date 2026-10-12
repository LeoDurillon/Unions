/** Agent runs allowed at the same time, shared by the ticket scheduler and the investigations. */
export class RunSlots {
  private used = 0;

  constructor(readonly max: number) {}

  tryTake(): boolean {
    if (this.used >= this.max) {
      return false;
    }
    this.used += 1;
    return true;
  }

  release(): void {
    this.used = Math.max(0, this.used - 1);
  }
}
