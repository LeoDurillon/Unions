// Tests for reading back Union's step comments on an issue.
import { describe, expect, test } from 'bun:test';

import {
  issueStepComments,
  parseStepComment,
  stepCommentId,
  withoutTicketMarkers,
} from './issue-step-comments';

const SUMMARY = [
  '<!-- union:ticket=12 step=summary -->',
  '### Summary · v2 · approved',
  '',
  'The summary.',
  '',
  '<details><summary>Revision feedback</summary>',
  '',
  '**v1:** shorter',
  '',
  '</details>',
].join('\n');

const TECHNICAL = [
  '<!-- union:ticket=12 step=technical -->',
  '### Technical implementation · v1 · awaiting review',
  '',
  'Plan with <details><summary>a fold</summary> inside.',
].join('\n');

describe('parseStepComment', () => {
  test('reads the step, version, validation and content, without the feedback', () => {
    expect(parseStepComment({ id: '5', body: SUMMARY })).toEqual({
      step: 'summary',
      version: 2,
      validation: 'approved',
      content: 'The summary.',
      commentId: '5',
    });
  });

  test('keeps a fold of the content itself', () => {
    expect(parseStepComment({ id: '6', body: TECHNICAL })?.content).toBe(
      'Plan with <details><summary>a fold</summary> inside.',
    );
  });

  test('reads a revision requested, and Windows line ends', () => {
    const body = TECHNICAL.replace('awaiting review', 'revision requested').replaceAll(
      '\n',
      '\r\n',
    );
    expect(parseStepComment({ id: '6', body })?.validation).toBe('revise');
  });

  test('ignores other comments, and steps not prefilled', () => {
    expect(parseStepComment({ id: '1', body: 'LGTM' })).toBeNull();
    const implement = SUMMARY.replace('step=summary', 'step=implement');
    expect(parseStepComment({ id: '1', body: implement })).toBeNull();
    const custom = SUMMARY.replace('step=summary', 'step=agent_3');
    expect(parseStepComment({ id: '1', body: custom })).toBeNull();
    const noHeading = '<!-- union:ticket=12 step=summary -->\nhello';
    expect(parseStepComment({ id: '1', body: noHeading })).toBeNull();
  });
});

describe('issueStepComments', () => {
  test('pipeline order, the last comment of a step winning', () => {
    const later = SUMMARY.replace('v2', 'v3');
    const found = issueStepComments([
      { id: '6', body: TECHNICAL },
      { id: '5', body: SUMMARY },
      { id: '7', body: 'unrelated' },
      { id: '8', body: later },
    ]);
    expect(found.map((comment) => [comment.step, comment.version, comment.commentId])).toEqual([
      ['summary', 3, '8'],
      ['technical', 1, '6'],
    ]);
  });
});

describe('withoutTicketMarkers', () => {
  test('removes markers at the end and in the middle', () => {
    expect(withoutTicketMarkers('Text\n\n<!-- union:ticket=12 -->')).toBe('Text');
    expect(withoutTicketMarkers('A\n\n<!-- union:ticket=3 -->\n\nB')).toBe('A\n\nB');
  });
});

describe('stepCommentId', () => {
  test('the last comment of the step, whatever its content', () => {
    const implement = '<!-- union:ticket=12 step=implement -->\n### Implementation · v1 · approved';
    const comments = [
      { id: '1', body: implement },
      { id: '2', body: SUMMARY },
      { id: '3', body: implement },
    ];
    expect(stepCommentId(comments, 'implement')).toBe('3');
    expect(stepCommentId(comments, 'test_plan')).toBeNull();
  });
});
