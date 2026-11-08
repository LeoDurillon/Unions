import { expect, test } from 'bun:test';

import { flowSettingsChange, FlowSettingsError } from './flow-settings';
import type { FlowPreset } from './flows';

const typo: FlowPreset = { id: 'typo', name: 'Typo', steps: ['implement', 'final_review'] };
const planned: FlowPreset = {
  id: 'planned',
  name: 'Planned',
  steps: ['technical', 'implement', 'final_review'],
};

test('a project saves its own flows and a default among them, or goes back to the built-in ones', () => {
  expect(flowSettingsChange({ flows: [typo, planned], defaultFlow: 'typo' }, {})).toEqual({
    flows: [typo, planned],
    defaultFlow: 'typo',
  });
  expect(flowSettingsChange({ flows: null }, { flows: [typo], defaultFlow: 'typo' })).toEqual({
    flows: undefined,
    defaultFlow: undefined,
  });
  expect(flowSettingsChange({}, { defaultFlow: 'quick' })).toEqual({
    flows: undefined,
    defaultFlow: 'quick',
  });
});

test('repeated names, steps that are no flow and an unknown default are refused', () => {
  const cases: Record<string, unknown>[] = [
    { flows: [typo, { ...planned, name: 'typo' }] },
    { flows: [{ ...typo, steps: ['implement'] }] },
    { flows: [typo], defaultFlow: 'full' },
    { flows: [] },
  ];
  for (const body of cases) {
    expect(() => flowSettingsChange(body, {})).toThrow(FlowSettingsError);
  }
});

test('a flow keeps what it is for, trimmed; an empty one is dropped and a long one refused', () => {
  const saved = flowSettingsChange(
    {
      flows: [
        { ...typo, description: '  Typos and wording.  ' },
        { ...planned, description: ' ' },
      ],
    },
    {},
  );
  expect(saved.flows).toEqual([{ ...typo, description: 'Typos and wording.' }, planned]);
  expect(() =>
    flowSettingsChange({ flows: [{ ...typo, description: 'x'.repeat(201) }] }, {}),
  ).toThrow(FlowSettingsError);
});
