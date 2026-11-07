import { describe, expect, test } from 'bun:test';

import { orderPages, pageName, pageTitle } from './guide-pages';

describe('pageName', () => {
  test('a Markdown file with a plain name is a page', () => {
    expect(pageName('first-project.md')).toBe('first-project');
    expect(pageName('README.md')).toBe('README');
  });

  test('any other file is not', () => {
    for (const file of ['../AGENTS.md', 'notes.txt', 'Upper.md', '.hidden.md', 'a/b.md']) {
      expect(pageName(file)).toBeNull();
    }
  });
});

describe('pageTitle', () => {
  test('the first top heading, else the name', () => {
    expect(pageTitle('tickets', 'intro\n# The board and tickets\n## Create')).toBe(
      'The board and tickets',
    );
    expect(pageTitle('tickets', '## Only a subheading')).toBe('tickets');
  });
});

describe('orderPages', () => {
  test('the index, then its links in order, then the rest by name', () => {
    const pages = ['zeta', 'tickets', 'README', 'alpha', 'installation'].map((name) => ({
      name,
      title: name,
    }));
    const index =
      '[Install](installation.md): …\n[Tickets](tickets.md#create) and again [x](installation.md)';
    expect(orderPages(pages, index).map((page) => page.name)).toEqual([
      'README',
      'installation',
      'tickets',
      'alpha',
      'zeta',
    ]);
  });
});
