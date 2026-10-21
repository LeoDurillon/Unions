// Identifies this container's run: its init's (PID 1) start in clock ticks, which a container restart changes and a `bun --watch` reload does not.
import { readFile } from 'node:fs/promises';

/** `starttime` is field 22 of the stat line; fields after the command's `)` start at field 3. */
const STARTTIME_AFTER_COMMAND = 19;
const INIT_PID = 1;

/** Null outside Linux (no `/proc`). Raw ticks, so no clock is involved. */
export async function initStartTicks(): Promise<string | null> {
  try {
    const stat = await readFile(`/proc/${INIT_PID}/stat`, 'utf8');
    return (
      stat
        .slice(stat.lastIndexOf(')') + 2)
        .split(' ')
        .at(STARTTIME_AFTER_COMMAND) ?? null
    );
  } catch {
    return null;
  }
}
