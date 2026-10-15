import { asc, desc, eq, inArray } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './schema-mcp';

export type McpConnector = typeof schema.mcpConnectors.$inferSelect;
export type McpConnectorCheck = typeof schema.mcpConnectorChecks.$inferSelect;

/** Every claude.ai connector's tools start with this: `mcp__claude_ai_Figma__get_screenshot`. */
export const CONNECTOR_TOOL_PREFIX = 'mcp__claude_ai_';

/** `claude.ai Figma: https://mcp.figma.com/mcp - ✔ Connected` */
const LIST_LINE = /^claude\.ai (?<name>.+?): (?<url>\S+) - (?<status>.+)$/u;

/**
 * The permission rule for all of a connector's tools. Claude Code names the server `claude.ai <Name>`
 * and replaces in tool names every character other than letters, digits, `_` and `-` with `_`.
 */
export function connectorTool(name: string): string {
  return `mcp__${`claude.ai ${name}`.replaceAll(/[^\w-]/gu, '_')}`;
}

export function isConnectorTool(tool: string): boolean {
  return tool.startsWith(CONNECTOR_TOOL_PREFIX);
}

/**
 * What an agent must know to use a connector inside Union, by its permission rule. Figma's
 * screenshots and assets come as links to download with `curl`, which agents are refused: the
 * screenshot can come inline instead.
 */
const CONNECTOR_HINTS: Record<string, string> = {
  [connectorTool('Figma')]:
    'Figma: you cannot download URLs (curl is refused), so links to Figma assets are of no use to you. To see a design, call get_screenshot with enableBase64Response: true; the image then comes in the tool result. Keep maxDimension at its default unless you need fine detail.',
};

/** The hints for the connectors among a run's tools; null when it uses none that needs one. */
export function connectorHints(tools: readonly string[]): string | null {
  const hints = tools.flatMap((tool) => CONNECTOR_HINTS[tool] ?? []);
  return hints.length > 0 ? hints.join('\n\n') : null;
}

/** The claude.ai connectors in `claude mcp list`'s output; other servers are not listed here. */
export function parseMcpList(output: string): Omit<McpConnector, 'checkedAt'>[] {
  return output.split('\n').flatMap((line) => {
    const match = LIST_LINE.exec(line.trim())?.groups;
    if (!match?.name || !match.url || !match.status) {
      return [];
    }
    const status = match.status.trim();
    return [{ name: match.name, url: match.url, status, connected: status.includes('Connected') }];
  });
}

export function listConnectors(db: Db): McpConnector[] {
  return db.select().from(schema.mcpConnectors).orderBy(asc(schema.mcpConnectors.name)).all();
}

/** The connectors as a check just read them: the ones gone from the account go. */
export function replaceConnectors(db: Db, connectors: Omit<McpConnector, 'checkedAt'>[]): void {
  db.transaction((tx) => {
    tx.delete(schema.mcpConnectors).run();
    for (const connector of connectors) {
      tx.insert(schema.mcpConnectors).values(connector).run();
    }
  });
}

const ACTIVE = ['queued', 'running'] as const;

/** Queues a check of the connectors, unless one is already waiting or running: that one is returned. */
export function queueConnectorCheck(db: Db): McpConnectorCheck {
  return db.transaction((tx) => {
    const active = tx
      .select()
      .from(schema.mcpConnectorChecks)
      .where(inArray(schema.mcpConnectorChecks.status, ACTIVE))
      .get();
    return active ?? tx.insert(schema.mcpConnectorChecks).values({}).returning().get();
  });
}

export function latestConnectorCheck(db: Db): McpConnectorCheck | null {
  return (
    db.select().from(schema.mcpConnectorChecks).orderBy(desc(schema.mcpConnectorChecks.id)).get() ??
    null
  );
}

/** The oldest queued check, now running; null when none waits. */
export function claimConnectorCheck(db: Db): McpConnectorCheck | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(schema.mcpConnectorChecks)
      .where(eq(schema.mcpConnectorChecks.status, 'queued'))
      .orderBy(asc(schema.mcpConnectorChecks.id))
      .get();
    if (!next) {
      return null;
    }
    return tx
      .update(schema.mcpConnectorChecks)
      .set({ status: 'running' })
      .where(eq(schema.mcpConnectorChecks.id, next.id))
      .returning()
      .get();
  });
}

export function finishConnectorCheck(db: Db, id: number, error: string | null): void {
  db.update(schema.mcpConnectorChecks)
    .set({ status: error === null ? 'succeeded' : 'failed', error, finishedAt: Date.now() })
    .where(eq(schema.mcpConnectorChecks.id, id))
    .run();
}

/** Fails the checks a stopped worker left running. */
export function failInterruptedChecks(db: Db): void {
  db.update(schema.mcpConnectorChecks)
    .set({ status: 'failed', error: 'The worker stopped during the check', finishedAt: Date.now() })
    .where(eq(schema.mcpConnectorChecks.status, 'running'))
    .run();
}
