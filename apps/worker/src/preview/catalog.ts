import { isRecord } from '@union/core';

import { compose, printedJson } from './compose';
import type { PreviewDeps, Target } from './target';

/** Every service of the compose file and the profiles it belongs to (none: always enabled). */
export type Catalog = { services: Record<string, string[]> };

/** `--profile <name>` for each profile the settings enable. */
export function profileArgs(target: Target): string[] {
  return (target.config.profiles ?? []).flatMap((profile) => ['--profile', profile]);
}

/**
 * The whole compose file, every profile enabled (`--profile '*'`): what the settings offer, and how
 * to explain a service that is missing because its profile is not enabled. Best effort: a file that
 * cannot be read gives an empty catalog (resolving it reports why).
 */
export async function readCatalog(deps: PreviewDeps, target: Target): Promise<Catalog> {
  const output = await compose(deps.runtime, deps.settings, {
    args: [
      '-p',
      target.project,
      '--profile',
      '*',
      '-f',
      target.config.composeFile,
      'config',
      '--format',
      'json',
    ],
    workspaceVolume: target.workspaceVolume,
    env: { ...target.plain, ...target.secrets },
    keepAll: true,
  });
  const parsed = printedJson(output.lines);
  const services = isRecord(parsed) && isRecord(parsed.services) ? parsed.services : {};
  return {
    services: Object.fromEntries(
      Object.entries(services).map(([name, service]) => {
        const profiles =
          isRecord(service) && Array.isArray(service.profiles) ? service.profiles : [];
        return [name, profiles.filter((profile): profile is string => typeof profile === 'string')];
      }),
    ),
  };
}

/** What the settings show: the profiles, and every service. */
export function catalogSummary(catalog: Catalog): { profiles: string[]; services: string[] } {
  return {
    profiles: [...new Set(Object.values(catalog.services).flat())].toSorted(),
    services: Object.keys(catalog.services),
  };
}

/** Why an exposed service is missing, when it is because none of its profiles is enabled. */
export function profileHint(catalog: Catalog, service: string): string | null {
  const profiles = catalog.services[service];
  return profiles && profiles.length > 0
    ? `"${service}" is only in profile${profiles.length > 1 ? 's' : ''} ${profiles.join(', ')}: enable one in the Preview settings`
    : null;
}
