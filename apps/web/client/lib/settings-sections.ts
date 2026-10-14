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
      { id: 'checks', label: 'Checks' },
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
    label: 'Notion',
    sections: [
      { id: 'notion', label: 'Connection' },
      { id: 'event-rules', label: 'Event rules' },
      { id: 'event-activity', label: 'Rule activity' },
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

/** Opens the active project's settings at one section, closing an open ticket. */
export function openSettings(section: SettingsSection = 'general'): void {
  setParams({ settings: section, ticket: null });
}

export function closeSettings(): void {
  if (readParam('settings') !== null) {
    setParams({ settings: null });
  }
}
