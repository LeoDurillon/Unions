// Where a specification can come from: the ticket's text, the PR's description, an issue, a tracker's item.

import { INTEGRATION_KIND_NAMES } from '../integrations/kinds';

export const SPEC_SOURCES = ['pr', 'ticket', 'issue', ...INTEGRATION_KIND_NAMES] as const;
export type SpecSource = (typeof SPEC_SOURCES)[number];
