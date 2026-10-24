// A project's Notion integration: its config, secret and data source columns, read from and saved to `integrations`.
import type { Db } from '../db';
import type { NotionDataSource, NotionProperty } from '../notion-api';
import { integrationOf, removeIntegration, saveIntegration, storeFields } from './store';

/** A Notion integration's config: the data source tickets come from. */
type NotionConfig = { dataSourceId: string };

/** What a call to Notion for the project needs; null when it is not connected to a data source. */
type NotionAccess = { integrationId: number; token: string; dataSourceId: string };

/** The data source's columns as last read: rules point at its properties by id. */
export type NotionSchema = {
  projectId: number;
  dataSourceId: string;
  title: string;
  properties: NotionProperty[];
  fetchedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNotionConfig(config: unknown): config is NotionConfig {
  return isRecord(config) && typeof config.dataSourceId === 'string' && config.dataSourceId !== '';
}

export function notionConfigOf(config: unknown): NotionConfig {
  if (!isNotionConfig(config)) {
    throw new Error('This Notion integration has no data source');
  }
  return config;
}

function isProperty(value: unknown): value is NotionProperty {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    Array.isArray(value.options)
  );
}

function isDataSource(fields: unknown): fields is NotionDataSource {
  return (
    isRecord(fields) &&
    typeof fields.title === 'string' &&
    Array.isArray(fields.properties) &&
    fields.properties.every(isProperty)
  );
}

export function notionAccessOf(db: Db, projectId: number): NotionAccess | null {
  const integration = integrationOf(db, projectId, 'notion');
  if (!integration || !isNotionConfig(integration.config)) {
    return null;
  }
  return {
    integrationId: integration.id,
    token: integration.secret,
    dataSourceId: integration.config.dataSourceId,
  };
}

export function notionSchemaOf(db: Db, projectId: number): NotionSchema | null {
  const integration = integrationOf(db, projectId, 'notion');
  if (
    !integration ||
    !isNotionConfig(integration.config) ||
    !isDataSource(integration.fields) ||
    integration.fieldsReadAt === null
  ) {
    return null;
  }
  return {
    projectId,
    dataSourceId: integration.config.dataSourceId,
    title: integration.fields.title,
    properties: integration.fields.properties,
    fetchedAt: integration.fieldsReadAt,
  };
}

/** Keeps the data source's columns as Notion has them now; the project must be connected. */
export function storeNotionSchema(
  db: Db,
  projectId: number,
  source: NotionDataSource,
): NotionSchema {
  const access = notionAccessOf(db, projectId);
  if (!access) {
    throw new Error('This project is not connected to a Notion data source');
  }
  const fields: NotionDataSource = { title: source.title, properties: source.properties };
  const saved = storeFields(db, access.integrationId, { fields, title: source.title });
  return {
    projectId,
    dataSourceId: access.dataSourceId,
    ...fields,
    fetchedAt: saved.fieldsReadAt ?? Date.now(),
  };
}

/**
 * Connects the project to Notion, changes its secret or data source, or disconnects it (no secret).
 * A changed data source forgets the columns read for the old one.
 */
export function saveNotionConnection(
  db: Db,
  projectId: number,
  connection: { token: string | null; dataSourceId: string | null },
): void {
  if (!connection.token) {
    removeIntegration(db, projectId, 'notion');
    return;
  }
  saveIntegration(db, projectId, 'notion', {
    secret: connection.token,
    config: connection.dataSourceId ? { dataSourceId: connection.dataSourceId } : {},
  });
}
