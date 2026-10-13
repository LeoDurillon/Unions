import { expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  ticketAttachmentsDir,
  type ContainerRuntime,
  type ExecResult,
} from '@union/core';

import { syncAttachments } from './attachments-sync';

function recordingRuntime(calls: string[]): ContainerRuntime {
  return {
    // oxlint-disable-next-line require-yield -- the command prints nothing
    async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
      calls.push(command.join(' '));
      await Promise.resolve();
      return { exitCode: 0, stderr: '' };
    },
    copyIn: (_name: string, hostDir: string, containerDir: string) => {
      calls.push(`copy ${hostDir} ${containerDir}`);
      return Promise.resolve();
    },
  } as unknown as ContainerRuntime;
}

test('the container gets exactly the ticket’s current files, before each step', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticket = createTicket(db, { projectId: project.id, title: 't' });
  const calls: string[] = [];
  const runtime = recordingRuntime(calls);

  await syncAttachments(db, runtime, 'c', ticket.id);
  expect(calls).toEqual(['rm -rf /workspace/attachments']);

  db.insert(schema.ticketAttachments)
    .values({
      ticketId: ticket.id,
      name: 'a.csv',
      size: 1,
      contentType: 'text/csv',
      blobId: 'x',
    })
    .run();
  calls.length = 0;
  await syncAttachments(db, runtime, 'c', ticket.id);
  expect(calls).toEqual([
    'rm -rf /workspace/attachments',
    `copy ${ticketAttachmentsDir(ticket.id)} /workspace/attachments`,
  ]);
});
