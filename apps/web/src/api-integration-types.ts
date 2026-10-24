// The integrations' shapes the API answers with: a connected tracker without its secret, an item to import.
import type { IntegrationKindName } from '@union/core';

/** A tracker the project is connected to, without its secret (`toPublicIntegration`). */
export type PublicIntegration = {
  kind: IntegrationKindName;
  /** The source's name (a Notion data source's title); empty until its columns are read. */
  title: string;
  /** Its config is complete: tickets can be imported from it (the New ticket dialog offers it). */
  ready: boolean;
  config: Record<string, unknown>;
  fieldsReadAt: number | null;
};

/** An item of a tracker fetched for import (a Notion page): shown as a preview, then turned into a ticket. */
export type SourceImport = {
  title: string;
  body: string;
  url: string;
  truncated: boolean;
  /** The item, linked to the ticket created from it (event rules update it). */
  id: string;
};
