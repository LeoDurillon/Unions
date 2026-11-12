import { describe, expect, test } from 'bun:test';

import { shortcutKey } from './shortcuts';

const PLAIN = {
  key: 'j',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  repeat: false,
  target: null,
};

describe('shortcutKey', () => {
  test('a plain key is a shortcut', () => {
    expect(shortcutKey(PLAIN)).toBe('j');
    expect(shortcutKey({ ...PLAIN, key: '?' })).toBe('?');
  });

  test('a modifier, a held key or a key already taken is not', () => {
    expect(shortcutKey({ ...PLAIN, ctrlKey: true })).toBeNull();
    expect(shortcutKey({ ...PLAIN, metaKey: true })).toBeNull();
    expect(shortcutKey({ ...PLAIN, altKey: true })).toBeNull();
    expect(shortcutKey({ ...PLAIN, repeat: true })).toBeNull();
    expect(shortcutKey({ ...PLAIN, defaultPrevented: true })).toBeNull();
  });

  test('a key typed in a field belongs to the field', () => {
    const input = { tagName: 'INPUT' } as unknown as EventTarget;
    const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;
    const button = { tagName: 'BUTTON' } as unknown as EventTarget;
    expect(shortcutKey({ ...PLAIN, target: input })).toBeNull();
    expect(shortcutKey({ ...PLAIN, target: editable })).toBeNull();
    expect(shortcutKey({ ...PLAIN, target: button })).toBe('j');
  });
});
