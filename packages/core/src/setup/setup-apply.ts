// What applying each section of a setup proposal makes of the project's settings, and whether it
// already matches. Browser-safe.
import type { PreviewConfig, ProjectConfig, ProjectScript } from '../schema/schema-types';
import type { SetupChecks, SetupPreview, SetupProposal } from './setup-proposal-types';

/** The sections Apply writes to the settings; the agent image is read from its own table. */
const SETUP_SECTIONS = ['checks', 'scripts', 'preview', 'e2e', 'instructions'] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];

/** The commands it proposes; one it leaves empty stays as it is. */
export function checksChange(checks: SetupChecks): {
  installCommand?: string;
  gateCommand?: string;
} {
  return {
    ...(checks.installCommand === '' ? {} : { installCommand: checks.installCommand }),
    ...(checks.gateCommand === '' ? {} : { gateCommand: checks.gateCommand }),
  };
}

/** The current scripts, with a proposed one replacing the script of the same name. */
export function scriptsAfter(
  current: readonly ProjectScript[] | undefined,
  proposed: readonly ProjectScript[],
): ProjectScript[] {
  const names = new Set(proposed.map((script) => script.name.toLowerCase()));
  return [
    ...(current ?? []).filter((script) => !names.has(script.name.toLowerCase())),
    ...proposed,
  ];
}

/** Lists and flags it proposes; empty ones and unset flags leave the current values. */
function previewExtras(proposed: SetupPreview): Partial<PreviewConfig> {
  const lists = {
    services: proposed.services,
    agentServices: proposed.agentServices,
    sharedServices: proposed.sharedServices,
    sharedCommands: proposed.sharedCommands,
    profiles: proposed.profiles,
  };
  return {
    ...Object.fromEntries(Object.entries(lists).filter(([, list]) => list.length > 0)),
    // Stored as the settings store it: one line break at the end.
    ...(proposed.composeAdditions.trim() === ''
      ? {}
      : { composeAdditions: `${proposed.composeAdditions.trimEnd()}\n` }),
  };
}

/**
 * The agent's switches as the settings keep them, only where they differ from the defaults (ports
 * forwarded, the preview not started): a proposed default clears the current value.
 */
function withSwitches(preview: PreviewConfig, proposed: SetupPreview): PreviewConfig {
  const { forwardPorts, startForImplementation, ...rest } = preview;
  const forward = proposed.forwardPorts ?? forwardPorts ?? true;
  const start = proposed.startForImplementation ?? startForImplementation ?? false;
  return {
    ...rest,
    ...(forward ? {} : { forwardPorts: false }),
    ...(start ? { startForImplementation: true } : {}),
  };
}

/** The current preview settings with the proposal over them; variables are added, not replaced. */
export function previewAfter(
  current: PreviewConfig | undefined,
  proposed: SetupPreview,
): PreviewConfig {
  const merged: PreviewConfig = {
    ...current,
    composeFile: proposed.composeFile,
    env: { ...current?.env, ...proposed.env },
    ...previewExtras(proposed),
  };
  return withSwitches(merged, proposed);
}

/** The same value whatever the order of its keys. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

const APPLIED: Record<SetupSection, (proposal: SetupProposal, config: ProjectConfig) => boolean> = {
  checks: ({ checks }, config) =>
    checks === null || same({ ...config, ...checksChange(checks) }, config),
  scripts: ({ scripts }, config) =>
    scripts === null || same(scriptsAfter(config.scripts, scripts.items), config.scripts),
  preview: ({ preview }, config) =>
    preview === null || same(previewAfter(config.preview, preview), config.preview),
  e2e: ({ e2e }, config) => e2e === null || config.preview?.e2eCommand === e2e.text,
  instructions: ({ instructions }, config) =>
    instructions === null || config.instructions === instructions.text,
};

/** Whether the settings already hold what the section proposes; true for a section it leaves out. */
export function sectionApplied(
  section: SetupSection,
  proposal: SetupProposal,
  config: ProjectConfig,
): boolean {
  return APPLIED[section](proposal, config);
}

/** The sections the proposal holds whose values the settings do not have yet. */
export function pendingSections(proposal: SetupProposal, config: ProjectConfig): SetupSection[] {
  return SETUP_SECTIONS.filter((section) => !sectionApplied(section, proposal, config));
}
