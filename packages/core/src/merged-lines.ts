// Lines from several byte streams as one, in the order they arrive: a command's stdout and stderr together.

type Source = AsyncIterable<Buffer | string>;

/**
 * Yields the lines of every source as they arrive, a last unterminated line included. A source that
 * fails ends there; the others go on.
 */
export async function* mergedLines(sources: readonly Source[]): AsyncGenerator<string> {
  const queue: string[] = [];
  const state: { open: number; wake: (() => void) | null } = { open: sources.length, wake: null };
  const notify = (): void => {
    const resume = state.wake;
    state.wake = null;
    resume?.();
  };
  const nextLine = (): Promise<void> =>
    new Promise<void>((resolve) => {
      state.wake = resolve;
    });
  const pump = async (source: Source): Promise<void> => {
    let pending = '';
    try {
      for await (const chunk of source) {
        pending += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        queue.push(...lines);
        notify();
      }
    } catch {
      // A broken pipe ends this source only.
    } finally {
      if (pending !== '') {
        queue.push(pending);
      }
      state.open -= 1;
      notify();
    }
  };
  const pumps = Promise.all(sources.map((source) => pump(source)));
  while (state.open > 0 || queue.length > 0) {
    const line = queue.shift();
    if (line === undefined) {
      await nextLine();
    } else {
      yield line;
    }
  }
  await pumps;
}
