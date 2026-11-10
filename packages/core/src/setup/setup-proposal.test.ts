// Tests reading the setup agent's answer block into a proposal, and the values it refuses.
import { expect, test } from 'bun:test';

import { parseSetupProposal } from './setup-proposal';

function answer(block: unknown): string {
  return `Summary first.\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\``;
}

test('null when the answer holds no setup block', () => {
  expect(parseSetupProposal('No block here.')).toBeNull();
  expect(parseSetupProposal('```json\n{"other": 1}\n```')).toBeNull();
});

test('reads every section', () => {
  const proposal = parseSetupProposal(
    answer({
      summary: 'A Next.js app',
      checks: { installCommand: 'npm ci', gateCommand: 'npm test', why: 'package.json' },
      scripts: {
        items: [{ name: 'Seed', command: 'npm run seed', timeoutSec: 120 }],
        why: 'seed.ts',
      },
      preview: {
        composeFile: 'compose.yaml',
        services: [{ name: 'web', port: 3000, prefix: '' }],
        env: { API_URL: '{service.api.url}' },
        agentServices: ['db'],
        sharedServices: ['mailhog'],
        profiles: [],
        forwardPorts: true,
        why: 'compose.yaml',
      },
      e2e: { command: 'npx playwright test', why: 'playwright.config.ts' },
      secrets: [{ name: 'STRIPE_KEY', where: 'Stripe dashboard' }],
      projectFiles: [{ path: '.env.local', what: 'local overrides' }],
      instructions: { text: '# Build\n`npm run build`', why: 'README' },
      agentImage: {
        dockerfile: 'FROM union-agent\nRUN apt-get install -y python3',
        why: 'scripts/*.py',
      },
      tickets: [{ title: 'Add a test script', description: 'There is none.' }],
      questions: ['Which compose file?'],
    }),
  );
  expect(proposal).toMatchObject({
    summary: 'A Next.js app',
    checks: { installCommand: 'npm ci', gateCommand: 'npm test' },
    scripts: { items: [{ name: 'Seed', command: 'npm run seed', timeoutSec: 120 }] },
    preview: {
      composeFile: 'compose.yaml',
      services: [{ name: 'web', port: 3000, prefix: '' }],
      env: { API_URL: '{service.api.url}' },
      agentServices: ['db'],
      sharedServices: ['mailhog'],
      forwardPorts: true,
      startForImplementation: null,
    },
    e2e: { text: 'npx playwright test' },
    secrets: [{ name: 'STRIPE_KEY', where: 'Stripe dashboard' }],
    projectFiles: [{ path: '.env.local', what: 'local overrides' }],
    instructions: { text: '# Build\n`npm run build`' },
    agentImage: { why: 'scripts/*.py' },
    tickets: [{ title: 'Add a test script' }],
    questions: ['Which compose file?'],
    dropped: [],
  });
});

test('leaves out empty sections', () => {
  expect(
    parseSetupProposal(answer({ summary: 'Nothing to run', checks: {}, preview: {} })),
  ).toMatchObject({
    checks: null,
    preview: null,
    scripts: null,
    e2e: null,
    secrets: [],
  });
});

test('drops values the settings would refuse, and says why', () => {
  const proposal = parseSetupProposal(
    answer({
      summary: 's',
      scripts: {
        items: [
          { name: 'a', command: 'x' },
          { name: 'A', command: 'y' },
        ],
      },
      preview: {
        composeFile: 'compose.yaml',
        services: [
          { name: 'web', port: 70_000, prefix: '' },
          { name: 'api', port: 8080, prefix: 'API_' },
          { name: '-bad', port: 80, prefix: '' },
        ],
        env: { 'not a name': 'x', OK: 'y', N: 3 },
        agentServices: ['db', 'bad name'],
      },
      projectFiles: [{ path: '../etc/passwd' }, { path: '/abs' }],
    }),
  );
  expect(proposal?.scripts).toBeNull();
  expect(proposal?.preview?.services).toEqual([]);
  expect(proposal?.preview?.env).toEqual({ OK: 'y' });
  expect(proposal?.preview?.agentServices).toEqual(['db']);
  expect(proposal?.projectFiles).toEqual([]);
  expect(proposal?.dropped).toHaveLength(9);
});

test('never keeps a secret value or a file content', () => {
  const proposal = parseSetupProposal(
    answer({
      summary: 's',
      secrets: [{ name: 'TOKEN', value: 'abc123', where: '1Password' }],
      projectFiles: [{ path: '.env', contents: 'TOKEN=abc123', what: 'env' }],
    }),
  );
  expect(proposal?.secrets).toEqual([{ name: 'TOKEN', where: '1Password' }]);
  expect(proposal?.projectFiles).toEqual([{ path: '.env', what: 'env' }]);
  expect(JSON.stringify(proposal)).not.toContain('abc123');
});

test('reads the last setup block of the answer', () => {
  const text = `${answer({ summary: 'first' })}\n\n${answer({ summary: 'second' })}`;
  expect(parseSetupProposal(text)?.summary).toBe('second');
});

test('reads the compose additions and keeps shared commands only for shared services', () => {
  const proposal = parseSetupProposal(
    answer({
      summary: 's',
      preview: {
        composeFile: 'dev/compose.yml',
        composeAdditions: 'services:\n  api:\n    environment:\n      API_URL: x\n',
        sharedServices: ['db'],
        sharedCommands: [
          { service: 'db', create: 'createdb app_{ticket.id}', drop: 'dropdb app_{ticket.id}' },
          { service: 'api', create: 'echo' },
          { service: 'db' },
        ],
      },
    }),
  );
  expect(proposal?.preview?.composeAdditions).toContain('API_URL: x');
  expect(proposal?.preview?.sharedCommands).toEqual([
    { service: 'db', create: 'createdb app_{ticket.id}', drop: 'dropdb app_{ticket.id}' },
  ]);
  expect(proposal?.dropped).toEqual(['Shared commands for "api": not one of the shared services']);
});

test('splits secrets named together into one entry each', () => {
  const proposal = parseSetupProposal(
    answer({
      summary: 's',
      secrets: [
        { name: 'MJ_APIKEY_PUBLIC / MJ_APIKEY_PRIVATE', where: 'Mailjet' },
        { name: 'A, B-C' },
      ],
    }),
  );
  expect(proposal?.secrets).toEqual([
    { name: 'MJ_APIKEY_PUBLIC', where: 'Mailjet' },
    { name: 'MJ_APIKEY_PRIVATE', where: 'Mailjet' },
    { name: 'A', where: '' },
  ]);
  expect(proposal?.dropped).toEqual(['Secret "B-C": not a valid name']);
});
