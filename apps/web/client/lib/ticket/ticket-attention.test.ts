import { expect, test } from 'bun:test';

import type { TicketDetail } from '../../../src/api-types';
import { attentionOf, leadOf } from './ticket-attention';

function detail(phase: object, outputs: [string, string][] = []): TicketDetail {
  return {
    ticket: { flow: ['intake', 'implement'], phase, parent: null },
    project: { config: { baseBranch: 'main' } },
    outputs: outputs.map(([step, content]) => ({ step, content })),
  } as unknown as TicketDetail;
}

test('the lead is the first line of prose, without its Markdown', () => {
  expect(leadOf('## Description\n\n**Contexte.** Sur la page `X`, rien.')).toBe(
    'Contexte. Sur la page X, rien.',
  );
  expect(leadOf('VERDICT: APPROVED\n\n---\n- [ ] A criterion')).toBe('A criterion');
  expect(leadOf('# Only a title')).toBeNull();
});

test('a step waiting with questions counts those still unanswered', () => {
  const content = 'Intro.\n\n1. Scope?\n   Answer:\n\n2. Branch?\n   Answer: main\n';
  const attention = attentionOf(
    detail({ kind: 'awaiting_approval', step: 'intake' }, [['intake', content]]),
    {},
  );
  expect(attention?.title).toBe('Intake asks 1 question');
  expect(attention?.kind).toBe('step');
});

test('the final review says its verdict and its first finding', () => {
  const content = 'VERDICT: CHANGES_REQUESTED\n\nTrois problèmes bloquent.\n\n## Bloquant';
  const attention = attentionOf(
    detail({ kind: 'awaiting_approval', step: 'final_review' }, [['final_review', content]]),
    {},
  );
  expect(attention).toMatchObject({
    kind: 'review',
    title: 'The final review requests changes',
    detail: 'Trois problèmes bloquent.',
  });
});

test('a backlog ticket offers to start; a running one asks nothing', () => {
  expect(attentionOf(detail({ kind: 'backlog' }), {})).toMatchObject({
    kind: 'start',
    title: 'Ready to start',
    detail: 'Start runs Intake first.',
  });
  expect(attentionOf(detail({ kind: 'running', step: 'intake' }), {})).toBeNull();
});
