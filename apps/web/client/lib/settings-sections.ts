// The project settings pages by group, and opening or closing them through `?settings=`.
import { confirmLeave } from './leave-guard';
import { readParam, setParams, useUrlParam } from './url-state';

/** The project settings pages, in menu order, by group; the id is what `?settings=` holds. */
export const SETTINGS_GROUPS = [
  {
    label: 'Project',
    sections: [
      { id: 'general', label: 'General' },
      { id: 'files', label: 'Files' },
    ],
  },
  {
    label: 'Agents',
    sections: [
      { id: 'instructions', label: 'Instructions' },
      { id: 'memory', label: 'Memory' },
      { id: 'checks', label: 'Checks' },
      { id: 'scripts', label: 'Scripts' },
      { id: 'flows', label: 'Flows' },
    ],
  },
  {
    label: 'Pull requests',
    sections: [
      { id: 'pull-requests', label: 'Pull requests' },
      { id: 'review', label: 'Review' },
    ],
  },
  {
    label: 'Previews',
    sections: [
      { id: 'preview-services', label: 'Services' },
      { id: 'preview-variables', label: 'Variables' },
      { id: 'preview-e2e', label: 'End-to-end tests' },
      { id: 'preview-limits', label: 'Limits' },
    ],
  },
  {
    label: 'Integrations',
    sections: [{ id: 'notion', label: 'Notion' }],
  },
  {
    label: 'Events',
    sections: [
      { id: 'event-rules', label: 'Rules' },
      { id: 'event-activity', label: 'Activity' },
    ],
  },
  { label: null, sections: [{ id: 'danger', label: 'Danger zone' }] },
] as const;

export type SettingsSection = (typeof SETTINGS_GROUPS)[number]['sections'][number]['id'];

type Entry = { id: SettingsSection; label: string };

const SECTIONS: readonly Entry[] = SETTINGS_GROUPS.flatMap(
  (group): readonly Entry[] => group.sections,
);

function isSection(value: string | null): value is SettingsSection {
  return SECTIONS.some((section) => section.id === value);
}

export function sectionLabel(id: SettingsSection): string {
  return SECTIONS.find((section) => section.id === id)?.label ?? id;
}

/** The project settings page open in the URL (`?settings=preview-services`), or null. */
export function useSettingsSection(): SettingsSection | null {
  const value = useUrlParam('settings');
  return isSection(value) ? value : null;
}

/**
 * Opens the active project's settings at one section, closing an open ticket. Asks first when the
 * page shown has unsaved changes.
 */
export function openSettings(section: SettingsSection = 'general'): void {
  if (readParam('settings') === section || !confirmLeave()) {
    return;
  }
  setParams({ settings: section, union: null, page: null, ticket: null, review: null });
}

/** Leaves the settings page, asking first if it has unsaved changes; false when the user stays. */
export function closeSettings(): boolean {
  if (readParam('settings') === null) {
    return true;
  }
  if (!confirmLeave()) {
    return false;
  }
  setParams({ settings: null });
  return true;
}
