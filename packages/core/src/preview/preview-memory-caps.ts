// What each service of a preview may use: Union's memory cap and the preview's CPU cores. A
// service's own lower memory limit is kept, and a service that sets its own CPU cores keeps them.

import type { ContainerLimits } from '../docker/container-limits';
import { isRecord, type ComposeJson } from './preview-compose-check';

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;

/** A limit as `compose config` writes it (bytes, as a string or a number); null when there is none. */
function bytesOf(value: unknown): number | null {
  const bytes = typeof value === 'string' ? Number(value) : value;
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? bytes : null;
}

/** The `deploy.resources.limits` of a service, when it has one. */
function deployLimits(service: Record<string, unknown>): Record<string, unknown> | null {
  const { deploy } = service;
  const resources = isRecord(deploy) ? deploy.resources : undefined;
  const limits = isRecord(resources) ? resources.limits : undefined;
  return isRecord(limits) ? limits : null;
}

/** One service with its memory at most `cap` bytes, swap included; set where its own limit is, if any. */
function capped(service: Record<string, unknown>, cap: number): Record<string, unknown> {
  const deployed = deployLimits(service);
  const own = bytesOf(deployed?.memory) ?? bytesOf(service.mem_limit);
  const limit = own === null ? cap : Math.min(own, cap);
  const next: Record<string, unknown> = { ...service, memswap_limit: String(limit) };
  if (deployed && bytesOf(deployed.memory) !== null) {
    // Compose refuses `mem_limit` and `deploy.resources.limits.memory` with different values: keep the service's form.
    const deploy = isRecord(service.deploy) ? service.deploy : {};
    const resources = isRecord(deploy.resources) ? deploy.resources : {};
    next.deploy = {
      ...deploy,
      resources: { ...resources, limits: { ...deployed, memory: String(limit) } },
    };
  } else {
    next.mem_limit = String(limit);
  }
  return next;
}

/**
 * The file with every service's memory capped (Union settings → Resources): past it, the kernel stops
 * that service, not the user's machine; a service's own lower limit is kept. Each service also runs on
 * the preview's cores, unless it names its own.
 */
export function withResourceCaps(file: ComposeJson, limits: ContainerLimits): ComposeJson {
  const { services } = file;
  if (!isRecord(services)) {
    return file;
  }
  const cap = limits.memoryMb * BYTES_PER_MB;
  return {
    ...file,
    services: Object.fromEntries(
      Object.entries(services).map(([name, service]) => [
        name,
        isRecord(service) ? { cpuset: limits.cpuset, ...capped(service, cap) } : service,
      ]),
    ),
  };
}
