// Arrow keys in a tab bar (`role="tablist"`): Left and Right move to the previous or next tab, Home
// and End to the ends. Each move also selects the tab.
import { useEffect } from 'react';

const MOVES: Record<string, (at: number, count: number) => number> = {
  ArrowRight: (at, count) => (at + 1) % count,
  ArrowLeft: (at, count) => (at - 1 + count) % count,
  Home: () => 0,
  End: (_at, count) => count - 1,
};

/** The tab a key moves to, from tab `at` of `count`; null for any other key. */
export function nextTabIndex(key: string, at: number, count: number): number | null {
  const move = MOVES[key];
  return move && count > 0 ? move(Math.max(at, 0), count) : null;
}

/**
 * The keydown of the whole page: from a focused tab of a `role="tablist"`, moves the focus to the tab the
 * key names and clicks it (tabs are selected as the focus moves); disabled tabs are skipped. Every tab
 * bar gets it, without wiring each one.
 */
function onKey(event: KeyboardEvent): void {
  if (!(event.target instanceof HTMLElement) || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const current = event.target.closest<HTMLElement>('[role="tab"]');
  const list = current?.closest<HTMLElement>('[role="tablist"]');
  if (!current || !list) {
    return;
  }
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter(
    (tab) => !tab.hasAttribute('disabled') && tab.getAttribute('aria-disabled') !== 'true',
  );
  const next = nextTabIndex(event.key, tabs.indexOf(current), tabs.length);
  const target = next === null ? undefined : tabs[next];
  if (target && target !== current) {
    event.preventDefault();
    target.focus();
    target.click();
  }
}

/** Arrow keys in every tab bar of the page, for as long as the app is mounted. */
export function useTabListKeys(): void {
  useEffect(() => {
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, []);
}
