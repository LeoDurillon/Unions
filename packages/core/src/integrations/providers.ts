// The provider of each kind of tracker, built over the API clients the process has.
import type { NotionApi } from '../notion-api';
import type { IntegrationKindName } from './kinds';
import { notionProvider } from './notion-provider';
import type { IntegrationProvider } from './provider';

/** The clients providers call; tests substitute fakes. */
export type IntegrationApis = { notion: NotionApi };

const PROVIDERS: Record<IntegrationKindName, (apis: IntegrationApis) => IntegrationProvider> = {
  notion: (apis) => notionProvider(apis.notion),
};

export function integrationProvider(
  kind: IntegrationKindName,
  apis: IntegrationApis,
): IntegrationProvider {
  return PROVIDERS[kind](apis);
}
