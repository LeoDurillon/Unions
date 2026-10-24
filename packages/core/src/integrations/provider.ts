// The calls Union makes to a ticket source (`IntegrationProvider`), with the secret and config of one integration.

/** An item of the source (a Notion page), its markdown already cleaned. */
export type SourceItem = {
  id: string;
  title: string;
  url: string;
  markdown: string;
  truncated: boolean;
};

/**
 * Server-side calls to one kind of source. `config` is the integration's JSON, checked by the provider; a
 * config of the wrong shape throws.
 */
export type IntegrationProvider = {
  /** Checks the secret and config; the source's title (a data source's name) for the UI. */
  verify(secret: string, config: unknown): Promise<{ title: string }>;
  /** The source's columns as they are now, in the kind's own shape, and its title. */
  readFields(secret: string, config: unknown): Promise<{ title: string; fields: unknown }>;
  /** One item of the source; throws `ItemOutsideSourceError` for an item outside it. */
  item(secret: string, config: unknown, id: string): Promise<SourceItem>;
  /** Adds an item to the source, for kinds that can. */
  createItem?(
    secret: string,
    config: unknown,
    item: { title: string; markdown: string },
  ): Promise<SourceItem>;
};

/** An item that exists but is not part of the integration's source (a page of another data source). */
export class ItemOutsideSourceError extends Error {}
