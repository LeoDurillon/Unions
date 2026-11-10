// Tests what applying a setup proposal makes of the settings, and when a section already matches.
import { expect, test } from 'bun:test';

import type { ProjectConfig } from '../schema/schema-types';
import {
  checksChange,
  pendingSections,
  previewAfter,
  scriptsAfter,
  sectionApplied,
} from './setup-apply';
import type { SetupPreview, SetupProposal } from './setup-proposal-types';

const PREVIEW: SetupPreview = {
  composeFile: 'compose.yaml',
  composeAdditions: '',
  services: [{ name: 'web', port: 3000, prefix: '' }],
  env: { API_URL: '{service.api.url}' },
  agentServices: ['db'],
  sharedServices: [],
  sharedCommands: [],
  profiles: [],
  forwardPorts: null,
  startForImplementation: true,
  why: '',
};

function proposal(fields: Partial<SetupProposal>): SetupProposal {
  return {
    summary: '',
    checks: null,
    scripts: null,
    preview: null,
    e2e: null,
    secrets: [],
    projectFiles: [],
    instructions: null,
    agentImage: null,
    tickets: [],
    questions: [],
    dropped: [],
    ...fields,
  };
}

const BLANK: ProjectConfig = { baseBranch: 'main' };

test('a check left empty keeps the current command', () => {
  expect(checksChange({ installCommand: 'bun install', gateCommand: '', why: '' })).toEqual({
    installCommand: 'bun install',
  });
});

test('a proposed script replaces the one of the same name, whatever its case', () => {
  const current = [
    { name: 'Seed', command: 'old' },
    { name: 'Lint', command: 'lint' },
  ];
  expect(scriptsAfter(current, [{ name: 'seed', command: 'new' }])).toEqual([
    { name: 'Lint', command: 'lint' },
    { name: 'seed', command: 'new' },
  ]);
});

test('the preview keeps what the proposal leaves out and adds its variables', () => {
  const current = {
    composeFile: 'old.yaml',
    env: { OTHER: '1', API_URL: 'x' },
    idleStopMinutes: 30,
    profiles: ['web'],
  };
  expect(previewAfter(current, PREVIEW)).toEqual({
    composeFile: 'compose.yaml',
    env: { OTHER: '1', API_URL: '{service.api.url}' },
    idleStopMinutes: 30,
    profiles: ['web'],
    services: [{ name: 'web', port: 3000, prefix: '' }],
    agentServices: ['db'],
    startForImplementation: true,
  });
});

test('every section is pending on blank settings, and none once applied', () => {
  const full = proposal({
    checks: { installCommand: 'bun install', gateCommand: 'bun test', why: '' },
    scripts: { items: [{ name: 'Seed', command: 'bun seed' }], why: '' },
    preview: PREVIEW,
    e2e: { text: 'npx playwright test', why: '' },
    instructions: { text: '# Build', why: '' },
  });
  expect(pendingSections(full, BLANK)).toEqual([
    'checks',
    'scripts',
    'preview',
    'e2e',
    'instructions',
  ]);
  const applied: ProjectConfig = {
    baseBranch: 'main',
    gateCommand: 'bun test',
    installCommand: 'bun install',
    scripts: [{ name: 'Seed', command: 'bun seed' }],
    // Keys in another order: still the same settings.
    preview: { ...previewAfter(undefined, PREVIEW), e2eCommand: 'npx playwright test' },
    instructions: '# Build',
  };
  expect(pendingSections(full, applied)).toEqual([]);
});

test('a section the proposal leaves out counts as applied', () => {
  expect(sectionApplied('preview', proposal({}), BLANK)).toBe(true);
  expect(pendingSections(proposal({}), BLANK)).toEqual([]);
});

test('compose additions end with one line break, as the settings store them', () => {
  expect(
    previewAfter(undefined, { ...PREVIEW, composeAdditions: 'services: {}\n\n' }).composeAdditions,
  ).toBe('services: {}\n');
});

test('the agent switches are kept as the settings keep them: only where they differ from the defaults', () => {
  const defaults = { ...PREVIEW, forwardPorts: true, startForImplementation: false };
  const after = previewAfter(
    { composeFile: 'c', env: {}, forwardPorts: false, startForImplementation: true },
    defaults,
  );
  expect('forwardPorts' in after).toBe(false);
  expect('startForImplementation' in after).toBe(false);
  expect(previewAfter(undefined, { ...PREVIEW, forwardPorts: false })).toMatchObject({
    forwardPorts: false,
    startForImplementation: true,
  });
});
