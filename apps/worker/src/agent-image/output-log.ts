// A build's output lines, written to its row at most once a second and at the end.

const OUTPUT_WRITE_MS = 1000;
/** The lines an error message quotes from a build nobody watches. */
const TAIL_LINES = 20;

export class OutputLog {
  private readonly lines: string[] = [];
  private written = 0;

  constructor(private readonly write: (lines: readonly string[]) => void) {}

  add(line: string): void {
    this.lines.push(line);
    if (Date.now() - this.written >= OUTPUT_WRITE_MS) {
      this.flush();
    }
  }

  flush(): void {
    this.written = Date.now();
    this.write(this.lines);
  }

  tail(): string {
    return this.lines.slice(-TAIL_LINES).join('\n');
  }
}

/** For output nobody keeps. */
export function ignoreLines(): void {
  // Nothing is written.
}
