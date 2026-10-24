import { describe, expect, test } from 'bun:test';

import {
  groupingText,
  missingStarts,
  parseSavedSpecs,
  stackSpecs,
  startingSpecs,
} from './review-spec-lists';

describe('startingSpecs', () => {
  test('a pull request under review starts from its description', () => {
    expect(startingSpecs({ kind: 'review', prNumber: 12 })).toEqual([
      { kind: 'pr', ref: null, label: 'PR #12 description', url: null },
    ]);
  });

  test('a ticket from Notion starts from its text and its page', () => {
    const specs = startingSpecs({
      kind: 'ticket',
      notionOrigin: { id: 'p1', url: 'https://n/p1' },
    });
    expect(specs.map((spec) => [spec.kind, spec.ref])).toEqual([
      ['ticket', null],
      ['notion', 'p1'],
    ]);
  });
});

describe('missingStarts', () => {
  test('a start the list already had, even removed, is not added again', () => {
    const starts = startingSpecs({ kind: 'ticket', notionOrigin: { id: 'p1', url: null } });
    expect(missingStarts([{ kind: 'notion', ref: 'p1' }], starts).map((spec) => spec.kind)).toEqual(
      ['ticket'],
    );
  });
});

describe('stackSpecs', () => {
  test('a page linked to two members comes once, linked to both', () => {
    const specs = stackSpecs([
      {
        number: 1,
        specs: [
          { kind: 'pr', ref: null, label: 'PR #1', text: 'a' },
          { kind: 'notion', ref: 'p', label: 'N', text: 'n' },
        ],
      },
      {
        number: 2,
        specs: [
          { kind: 'pr', ref: null, label: 'PR #2', text: 'b' },
          { kind: 'notion', ref: 'p', label: 'N', text: 'n' },
        ],
      },
    ]);
    expect(specs.map((spec) => [spec.label, spec.prs])).toEqual([
      ['PR #1', [1]],
      ['N', [1, 2]],
      ['PR #2', [2]],
    ]);
  });
});

describe('groupingText', () => {
  test('one spec is its text; several are titled sections', () => {
    expect(groupingText([{ label: 'A', text: 'a' }])).toBe('a');
    expect(
      groupingText([
        { label: 'A', text: 'a' },
        { label: 'B', text: 'b' },
      ]),
    ).toBe('# A\n\na\n\n# B\n\nb');
  });
});

describe('parseSavedSpecs', () => {
  test('keeps the source, the edited text and removed; refuses an unknown kind', () => {
    expect(
      parseSavedSpecs([{ kind: 'notion', ref: 'p', label: 'Notion: X', text: '', removed: true }]),
    ).toEqual({
      specs: [
        { kind: 'notion', ref: 'p', label: 'Notion: X', url: null, text: null, removed: true },
      ],
    });
    expect(parseSavedSpecs([{ kind: 'wiki', label: 'x' }])).toHaveProperty('error');
  });
});
