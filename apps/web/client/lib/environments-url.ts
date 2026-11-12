// The project's Environments tab in the URL (`?view=environments&env=variables`): its pages,
// opening it from elsewhere. It replaces the old preview settings addresses
// (`?settings=preview-services`).
import { useEffect } from 'react';

import type { GuideTarget } from './guide/settings-guide';
import { confirmLeave } from './leave-guard';
import { CLOSE_REVIEW } from './review/review-url';
import { readParam, setParams, useUrlParam } from './url-state';

/** The tab's pages, in order; the id is what `?env=` holds. */
export const ENVIRONMENT_SECTIONS = [
  { id: 'compose', label: 'Compose' },
  { id: 'variables', label: 'Variables' },
  { id: 'agent', label: 'Agent' },
  { id: 'shared', label: 'Shared' },
  { id: 'e2e', label: 'End-to-end tests' },
  { id: 'limits', label: 'Limits' },
] as const;

export type EnvironmentSection = (typeof ENVIRONMENT_SECTIONS)[number]['id'];

/** Where each page's Learn more goes. */
export const ENVIRONMENT_GUIDE: Record<EnvironmentSection, GuideTarget> = {
  compose: ['previews', 'set-it-up'],
  variables: ['previews', 'set-it-up'],
  agent: ['previews', 'services-for-the-agent'],
  shared: ['previews', 'services-shared-between-previews'],
  e2e: ['previews', 'end-to-end-tests'],
  limits: ['previews', 'run-a-preview'],
};

/** Spread into `setParams` when the tab closes. */
export const CLOSE_ENVIRONMENTS = { view: null, env: null } as const;

function isSection(value: string | null): value is EnvironmentSection {
  return ENVIRONMENT_SECTIONS.some((section) => section.id === value);
}

export function environmentLabel(section: EnvironmentSection): string {
  return ENVIRONMENT_SECTIONS.find(({ id }) => id === section)?.label ?? section;
}

/** Whether the URL opens the Environments tab. */
export function useEnvironmentsOpen(): boolean {
  return useUrlParam('view') === 'environments';
}

/** The page of the tab the URL names; Compose when it names none or an old one (`services`). */
export function useEnvironmentSection(): EnvironmentSection {
  const value = useUrlParam('env');
  return isSection(value) ? value : 'compose';
}

/** Shows the tab from the project bar, at the page it was left on. */
export function showEnvironments(): void {
  setParams({ view: 'environments' });
}

/** Another page of the tab, from its own tabs; asks first when the page shown has unsaved changes. */
export function showEnvironmentSection(section: EnvironmentSection): void {
  if (readParam('env') !== section && confirmLeave()) {
    setParams({ env: section });
  }
}

/**
 * Opens the tab at one page from anywhere (a ticket's preview, a prompt to set previews up), closing
 * the settings and an open ticket. Asks first when the page shown has unsaved changes.
 */
export function openEnvironments(section: EnvironmentSection = 'compose'): void {
  const already = readParam('view') === 'environments' && readParam('env') === section;
  if (already || !confirmLeave()) {
    return;
  }
  setParams({
    view: 'environments',
    env: section,
    settings: null,
    union: null,
    page: null,
    guide: null,
    ticket: null,
    ...CLOSE_REVIEW,
  });
}

const OLD_SETTINGS: Record<string, EnvironmentSection> = {
  'preview-services': 'compose',
  'preview-variables': 'variables',
  'preview-e2e': 'e2e',
  'preview-limits': 'limits',
};

/** A link to the preview settings from before the tab (a bookmark, the guide) opens the tab instead. */
export function useOldPreviewSettings(): void {
  const settings = useUrlParam('settings');
  useEffect(() => {
    const section = settings === null ? undefined : OLD_SETTINGS[settings];
    if (section !== undefined) {
      setParams({ settings: null, view: 'environments', env: section });
    }
  }, [settings]);
}
