// The parts of a setup proposal the user dismissed, remembered per setup run in this browser.
import { useCallback, useState } from 'react';

const PREFIX = 'union.setup.dismissed.';

function read(investigationId: number): string[] {
  try {
    const raw: unknown = JSON.parse(
      globalThis.localStorage.getItem(`${PREFIX}${investigationId}`) ?? '[]',
    );
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function write(investigationId: number, keys: readonly string[]): void {
  try {
    globalThis.localStorage.setItem(`${PREFIX}${investigationId}`, JSON.stringify(keys));
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** The dismissed keys (a section, `ticket:<n>`), and dismissing or bringing one back. */
export function useSetupDismissed(
  investigationId: number,
): [readonly string[], (key: string, dismissed: boolean) => void] {
  const [keys, setKeys] = useState(() => read(investigationId));
  const toggle = useCallback(
    (key: string, dismissed: boolean): void => {
      setKeys((current) => {
        const next = dismissed ? [...new Set([...current, key])] : current.filter((k) => k !== key);
        write(investigationId, next);
        return next;
      });
    },
    [investigationId],
  );
  return [keys, toggle];
}
