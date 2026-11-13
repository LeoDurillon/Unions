// Notion's rule action as it runs: the values filled in and shaped from the stored columns, set on each page in turn.
// All or nothing: the first property gone or value refused fails it before any page is changed.

import type { DeliveryOutcome } from '../event/delivery-outcome';
import type { NotionApi } from './notion-api';
import { NotionError } from './notion-error';
import { isDataSource } from './notion-integration';
import { notionSets, notionSetsText } from './notion-rule-check';
import type { TrackerAccess } from './tracker-fields';
import type { RuleRun } from './tracker-rules';

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

/** Rate limits, Notion outages and network failures are tried again; a refusal fails with Notion's reason. */
function failure(error: unknown, detail: string): DeliveryOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const temporary =
    !(error instanceof NotionError) ||
    error.status === TOO_MANY_REQUESTS ||
    error.status >= SERVER_ERROR;
  return temporary
    ? { status: 'retry', error: message }
    : { status: 'failed', error: message, detail: `Tried: ${detail}` };
}

export async function deliverNotionRule(
  notion: NotionApi,
  access: TrackerAccess,
  { itemIds, action, values }: RuleRun,
): Promise<DeliveryOutcome> {
  if (action.kind !== 'tracker_fields') {
    return { status: 'failed', error: 'A Notion rule sets properties of the page' };
  }
  const properties = isDataSource(access.fields) ? access.fields.properties : [];
  const sets = notionSets(properties, action.values, values);
  if ('error' in sets) {
    return { status: 'failed', error: sets.error };
  }
  const detail = notionSetsText(sets.sets);
  const changes = Object.fromEntries(sets.sets.map((set) => [set.property.id, set.value]));
  try {
    // Each page in turn; a retry sets them all again, which changes nothing on those done.
    for (const pageId of itemIds) {
      await notion.updatePage(access.secret, pageId, changes);
    }
    const pages = itemIds.length > 1 ? ` on ${itemIds.length} pages` : '';
    return { status: 'succeeded', detail: `${detail}${pages}` };
  } catch (error) {
    return failure(error, detail);
  }
}
