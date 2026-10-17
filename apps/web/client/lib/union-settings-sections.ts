// The Union settings page open in the URL (`?union=implement`), and opening or leaving it.
import { confirmLeave } from './leave-guard';
import { isUnionSection, type UnionSection } from './union-settings-groups';
import { readParam, setParams, useUrlParam } from './url-state';

export function useUnionSection(): UnionSection | null {
  const value = useUrlParam('union');
  return isUnionSection(value) ? value : null;
}

/**
 * Opens the Union settings at one page, leaving the project's settings, the running previews and an
 * open ticket. Asks first when the page shown has unsaved changes.
 */
export function openUnionSettings(section: UnionSection = 'shared'): void {
  if (readParam('union') === section || !confirmLeave()) {
    return;
  }
  setParams({ union: section, settings: null, page: null, ticket: null });
}

/** Leaves the Union settings, asking first if they have unsaved changes; false when the user stays. */
export function closeUnionSettings(): boolean {
  if (readParam('union') === null) {
    return true;
  }
  if (!confirmLeave()) {
    return false;
  }
  setParams({ union: null });
  return true;
}
