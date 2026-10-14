/**
 * Preview settings and their templates. Browser-safe: the settings page uses the same reading and
 * checks as the worker.
 */
import type { PreviewConfig, PreviewService } from './schema-types';

/** What a variable's value can use, as `{name}`; `X` is a service name. */
export const PREVIEW_TEMPLATES = [
  { name: 'service.X.url', description: "An exposed service's address, from your browser" },
  { name: 'service.X.internal', description: "An exposed service's address, from another service" },
  { name: 'service.X.host', description: "A service's host name inside the environment" },
  { name: 'ticket.id', description: 'The ticket number' },
  { name: 'preview.host', description: 'The preview host (12.localhost)' },
  { name: 'preview.url', description: "The first exposed service's address" },
] as const;

const TEMPLATE = /\{(?<name>[a-zA-Z0-9_.-]+)\}/gu;
const SERVICE_TEMPLATE = /^service\.(?<service>[a-zA-Z0-9_-]+)\.(?<part>url|internal|host)$/u;
const HTTP_PORT = 80;

/** The exposed services, phase 1 settings (one service and port) included. */
export function exposedServices(config: PreviewConfig): PreviewService[] {
  if (config.services && config.services.length > 0) {
    return config.services;
  }
  return config.service && config.port
    ? [{ name: config.service, port: config.port, prefix: '' }]
    : [];
}

export function previewServiceHost(ticketId: number, prefix: string): string {
  return prefix === '' ? `${ticketId}.localhost` : `${prefix}.${ticketId}.localhost`;
}

export function previewAddress(host: string, publicPort: number): string {
  return publicPort === HTTP_PORT ? `http://${host}` : `http://${host}:${publicPort}`;
}

/** What the templates of one preview read. */
export type TemplateContext = {
  ticketId: number;
  publicPort: number;
  exposed: PreviewService[];
};

function serviceValue(context: TemplateContext, service: string, part: string): string | null {
  if (part === 'host') {
    return service;
  }
  const exposed = context.exposed.find((candidate) => candidate.name === service);
  if (!exposed) {
    return null;
  }
  return part === 'internal'
    ? `http://${service}:${exposed.port}`
    : previewAddress(previewServiceHost(context.ticketId, exposed.prefix), context.publicPort);
}

function templateValue(context: TemplateContext, name: string): string | null {
  const service = SERVICE_TEMPLATE.exec(name)?.groups;
  if (service?.service && service.part) {
    return serviceValue(context, service.service, service.part);
  }
  const [first] = context.exposed;
  const values: Record<string, string | null> = {
    'ticket.id': String(context.ticketId),
    'preview.host': previewServiceHost(context.ticketId, ''),
    'preview.url': first
      ? previewAddress(previewServiceHost(context.ticketId, first.prefix), context.publicPort)
      : null,
  };
  return values[name] ?? null;
}

/** The `{names}` of a value that are not templates, or name a service that is not exposed. */
export function templateProblems(value: string, exposed: PreviewService[]): string[] {
  const context: TemplateContext = { ticketId: 1, publicPort: HTTP_PORT, exposed };
  return [...value.matchAll(TEMPLATE)]
    .map((match) => match.groups?.name ?? '')
    .filter((name) => templateValue(context, name) === null)
    .map((name) =>
      SERVICE_TEMPLATE.test(name)
        ? `{${name}}: that service is not exposed`
        : `{${name}} is not a template`,
    );
}

/** The value with its templates filled in; an unknown one stays as written (checked on save). */
export function renderPreviewTemplate(value: string, context: TemplateContext): string {
  return value.replaceAll(TEMPLATE, (match, name: string) => templateValue(context, name) ?? match);
}
