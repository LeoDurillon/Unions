import { describe, expect, test } from 'bun:test';

import { guideHref, guideLinkOf, guideUrl } from './guide-links';
import { headingSlug } from './heading-slug';

describe('guideUrl', () => {
  test('another page of the guide, with or without a heading', () => {
    expect(guideUrl('tickets.md', 'href')).toBe('?guide=tickets');
    expect(guideUrl('first-project.md#connect-jira', 'href')).toBe(
      '?guide=first-project#connect-jira',
    );
  });

  test('a screenshot loads from the API', () => {
    expect(guideUrl('../docs/screenshots/board.png', 'src')).toBe('/api/guide/images/board.png');
    expect(guideUrl('https://example.com/a.png', 'src')).toBeUndefined();
  });

  test('the code docs open on GitHub; web links and anchors stay', () => {
    expect(guideUrl('../AGENTS.md', 'href')).toBe(
      'https://github.com/LeoDurillon/Unions/blob/main/AGENTS.md',
    );
    expect(guideUrl('https://docs.docker.com', 'href')).toBeUndefined();
    expect(guideUrl('#connect-jira', 'href')).toBeUndefined();
  });
});

describe('guideLinkOf', () => {
  test('reads back what guideHref writes', () => {
    expect(guideLinkOf(guideHref('tickets', 'start-a-ticket'))).toEqual({
      name: 'tickets',
      anchor: 'start-a-ticket',
    });
    expect(guideLinkOf(guideHref('README'))).toEqual({ name: 'README', anchor: null });
  });

  test('any other link is not a guide link', () => {
    expect(guideLinkOf('?view=repository')).toBeNull();
    expect(guideLinkOf('https://example.com')).toBeNull();
    expect(guideLinkOf('#heading')).toBeNull();
  });
});

describe('headingSlug', () => {
  test('matches the ids GitHub gives headings', () => {
    expect(headingSlug('Connect Jira')).toBe('connect-jira');
    expect(headingSlug("Review a ticket's branch")).toBe('review-a-tickets-branch');
    expect(headingSlug('Tell the agents how to build and check your code')).toBe(
      'tell-the-agents-how-to-build-and-check-your-code',
    );
    expect(headingSlug('Branches and pull requests: CI checks')).toBe(
      'branches-and-pull-requests-ci-checks',
    );
  });
});
