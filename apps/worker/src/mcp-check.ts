import {
  claimConnectorCheck,
  failInterruptedChecks,
  finishConnectorCheck,
  parseMcpList,
  replaceConnectors,
  type ContainerRuntime,
  type Db,
} from '@union/core';

import { runIn } from './container-exec';
import { seedCredentials, type ProvisionConfig } from './provision';

/** Where the connectors are read: a container like an agent's, with only the Claude login. */
const CHECK_CONTAINER = {
  name: 'union-mcp-check',
  homeVolume: 'union-mcp-check-home',
  workspaceVolume: 'union-mcp-check-ws',
};

/**
 * Reads the account's claude.ai connectors as an agent sees them (`claude mcp list`, which also
 * checks each one can be reached; no model runs), in a throwaway container removed after.
 */
export async function readConnectors(
  runtime: ContainerRuntime,
  config: ProvisionConfig,
): Promise<ReturnType<typeof parseMcpList>> {
  const remove = (): Promise<void> =>
    runtime.remove(CHECK_CONTAINER.name, {
      home: CHECK_CONTAINER.homeVolume,
      workspace: CHECK_CONTAINER.workspaceVolume,
    });
  // A check the worker was stopped in the middle of left its container.
  await remove().catch(() => null);
  try {
    await runtime.create({ ...CHECK_CONTAINER, image: config.image });
    await runtime.start(CHECK_CONTAINER.name);
    await seedCredentials(runtime, CHECK_CONTAINER.name, config.credentialsPath);
    const listed = await runIn(runtime, CHECK_CONTAINER.name, ['claude', 'mcp', 'list']);
    if (listed.exitCode !== 0) {
      throw new Error(`claude mcp list failed: ${(listed.stderr || listed.stdout).trim()}`);
    }
    return parseMcpList(listed.stdout);
  } finally {
    await remove();
  }
}

/** Runs the connector checks the user asks for (Agent settings → Connectors), one at a time. */
export class ConnectorChecker {
  private running: Promise<void> | null = null;

  constructor(
    private readonly deps: {
      db: Db;
      runtime: ContainerRuntime;
      config: ProvisionConfig;
      read?: typeof readConnectors;
    },
  ) {}

  recover(): void {
    failInterruptedChecks(this.deps.db);
  }

  tick(): void {
    if (this.running) {
      return;
    }
    const check = claimConnectorCheck(this.deps.db);
    if (check) {
      this.running = this.run(check.id);
    }
  }

  async idle(): Promise<void> {
    await this.running;
  }

  private async run(id: number): Promise<void> {
    const { db, runtime, config } = this.deps;
    try {
      const connectors = await (this.deps.read ?? readConnectors)(runtime, config);
      replaceConnectors(db, connectors);
      finishConnectorCheck(db, id, null);
    } catch (error) {
      finishConnectorCheck(db, id, error instanceof Error ? error.message : String(error));
    } finally {
      this.running = null;
    }
  }
}
