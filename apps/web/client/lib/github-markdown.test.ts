import { expect, test } from 'bun:test';

import { takeAlert } from './github-markdown';

function quote(text: string): Parameters<typeof takeAlert>[0] {
  return {
    type: 'element',
    tagName: 'blockquote',
    children: [
      { type: 'text', value: '\n' },
      { type: 'element', tagName: 'p', children: [{ type: 'text', value: text }] },
    ],
  };
}

test('a blockquote opening with an alert marker gives its kind, without the marker', () => {
  const node = quote('[!WARNING]\nReviews paused');
  expect(takeAlert(node)).toBe('warning');
  expect(node.children?.[1]?.children?.[0]?.value).toBe('Reviews paused');
});

test('a plain quote, or an unknown marker, is not an alert', () => {
  expect(takeAlert(quote('Just a quote'))).toBeNull();
  const unknown = quote('[!SHOUT] hey');
  expect(takeAlert(unknown)).toBeNull();
  expect(unknown.children?.[1]?.children?.[0]?.value).toBe('[!SHOUT] hey');
});
