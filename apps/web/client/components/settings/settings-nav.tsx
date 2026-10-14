import type { ReactElement } from 'react';

import { openSettings, SETTINGS_GROUPS, type SettingsSection } from '../../lib/settings-sections';

const ACTIVE = 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300';
const IDLE = 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800';
const DANGER = 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950';

function entryClass(id: SettingsSection, open: SettingsSection): string {
  if (id === open) {
    return ACTIVE;
  }
  return id === 'danger' ? DANGER : IDLE;
}

/** The settings pages by group; the danger zone last, set apart. */
export function SettingsNav({ section }: { section: SettingsSection }): ReactElement {
  return (
    <nav aria-label="Project settings" className="space-y-4">
      {SETTINGS_GROUPS.map((group) => (
        <div
          key={group.label ?? 'apart'}
          className={group.label ? '' : 'border-t border-zinc-200 pt-4 dark:border-zinc-800'}
        >
          {group.label ? (
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.sections.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-current={section === entry.id ? 'page' : undefined}
                  className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition ${entryClass(entry.id, section)}`}
                  onClick={() => {
                    openSettings(entry.id);
                  }}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
