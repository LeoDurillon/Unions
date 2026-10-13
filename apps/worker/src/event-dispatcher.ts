import {
  finishDelivery,
  getTicket,
  nextDelivery,
  NotionError,
  queueDeliveries,
  ruleProperty,
  ruleValue,
  schema,
  templateValues,
  type Db,
  type DeliveryOutcome,
  type NotionApi,
  type NotionProperty,
} from '@union/core';
import { eq } from 'drizzle-orm';

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
/** Deliveries done per tick: Notion allows about three requests a second. */
const PER_TICK = 3;

type Due = NonNullable<ReturnType<typeof nextDelivery>>;

type Target = {
  token: string;
  pageId: string;
  property: NotionProperty;
  value: { text: string; value: unknown };
};

/** The page, property and value a delivery sets, or why it cannot be done. */
function targetOf(db: Db, { delivery, rule, event }: Due): Target | DeliveryOutcome {
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  if (!ticket?.notionPageId) {
    return { status: 'skipped', detail: 'The ticket was not imported from Notion' };
  }
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, rule.projectId))
    .get();
  if (!project?.notionToken) {
    return { status: 'failed', error: 'The project is not connected to Notion' };
  }
  const property = ruleProperty(db, rule.projectId, rule.action);
  if (!property) {
    return {
      status: 'failed',
      error:
        'Its Notion property is no longer in the data source: refresh it in the Events settings',
    };
  }
  const value = ruleValue(property, rule.action, templateValues(project, ticket, event));
  if ('error' in value) {
    return { status: 'failed', error: value.error };
  }
  return { token: project.notionToken, pageId: ticket.notionPageId, property, value };
}

/** Sets the rule's Notion property on the ticket's page; says why when it cannot. */
async function deliver(db: Db, notion: NotionApi, due: Due): Promise<DeliveryOutcome> {
  const target = targetOf(db, due);
  if ('status' in target) {
    return target;
  }
  const { property, value } = target;
  const detail = `${property.name} set to ${value.text === '' ? '(empty)' : `"${value.text}"`}`;
  try {
    await notion.updatePage(target.token, target.pageId, { [property.id]: value.value });
    return { status: 'succeeded', detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Rate limits, Notion outages and network failures pass: try again later.
    const temporary =
      !(error instanceof NotionError) ||
      error.status === TOO_MANY_REQUESTS ||
      error.status >= SERVER_ERROR;
    return temporary
      ? { status: 'retry', error: message }
      : { status: 'failed', error: message, detail: `Tried: ${detail}` };
  }
}

/**
 * Applies the event rules: queues a delivery for each logged event a rule waits for, then does the
 * due ones, a few per tick and one at a time.
 */
export class EventDispatcher {
  private running: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly notion: NotionApi,
  ) {}

  tick(): void {
    this.running ??= this.workOnce();
  }

  private async workOnce(): Promise<void> {
    try {
      await this.work();
    } finally {
      this.running = null;
    }
  }

  async idle(): Promise<void> {
    await this.running;
  }

  private async work(): Promise<void> {
    queueDeliveries(this.db);
    for (let done = 0; done < PER_TICK; done++) {
      const due = nextDelivery(this.db);
      if (!due) {
        return;
      }
      const outcome = await deliver(this.db, this.notion, due).catch(
        (error: unknown): DeliveryOutcome => ({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      finishDelivery(this.db, due.delivery, outcome);
    }
  }
}
