// Tests for moving a preview's exposed services onto its own proxy network.
import { expect, test } from 'bun:test';

import { composeProblems, type ComposeJson } from './preview-compose-check';
import { previewProxyNetwork, withProxyNetwork } from './preview-proxy-network';

/** A file the user edited from one Union wrote with the shared network. */
const EDITED: ComposeJson = {
  name: 'union-t12',
  services: {
    web: {
      image: 'nginx',
      labels: { team: 'front', 'traefik.docker.network': 'union-preview' },
      networks: { default: null, union_preview: null },
    },
    db: { image: 'postgres', networks: { default: null } },
  },
  networks: { default: null, union_preview: { external: true, name: 'union-preview' } },
};

test('each preview has its own proxy network', () => {
  expect(previewProxyNetwork('union-t12')).toBe('union-t12-proxy');
  expect(previewProxyNetwork('union-r3')).toBe('union-r3-proxy');
});

test("an edited file moves off the shared network, which no preview's file may join any more", () => {
  expect(composeProblems(EDITED, { workspaceVolume: 'union-t12-ws' })).toEqual([
    'network "union_preview" is external: previews would share it',
  ]);
  const moved = withProxyNetwork(EDITED, 'union-t12');
  expect(moved.networks).toEqual({ default: null, union_preview: { name: 'union-t12-proxy' } });
  const services = moved.services as Record<string, Record<string, unknown>>;
  expect(services.web?.labels).toEqual({
    team: 'front',
    'traefik.docker.network': 'union-t12-proxy',
  });
  expect(services.db).toEqual({ image: 'postgres', networks: { default: null } });
  expect(composeProblems(moved, { workspaceVolume: 'union-t12-ws' })).toEqual([]);
});

test('a file without the shared network is left as it is', () => {
  const own: ComposeJson = { services: { web: { image: 'nginx' } } };
  expect(withProxyNetwork(own, 'union-t12')).toBe(own);
});
