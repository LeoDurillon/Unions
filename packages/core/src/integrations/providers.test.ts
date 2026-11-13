import { expect, test } from 'bun:test';

import { fakeJiraApi } from './fake-jira-api';
import { fakeNotionApi } from './fake-notion-api';
import { integrationKind } from './kinds';
import { integrationProvider, trackerAdapter } from './providers';
import { capabilitiesOf } from './tracker-adapter';

const apis = {
  notion: fakeNotionApi({ id: 'source', title: 'Roadmap' }, []),
  jira: fakeJiraApi({ key: 'ABC', name: 'Apollo' }, []),
};

test('each kind has its own adapter, with the capabilities the kind names', () => {
  for (const kind of ['notion', 'jira'] as const) {
    const adapter = trackerAdapter(kind, apis);
    expect(adapter.kind).toBe(kind);
    expect(capabilitiesOf(adapter)).toEqual([...integrationKind(kind).capabilities]);
  }
});

test("a kind's provider is its adapter", async () => {
  const provider = integrationProvider('jira', apis);
  const config = { site: 'https://acme.atlassian.net', email: 'ada@acme.com', projectKey: 'ABC' };
  expect(await provider.verify('token', config)).toEqual({ title: 'Apollo' });
});
