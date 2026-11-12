// Tests how a file read from the repository is shown: text, image, binary or too large.
import { describe, expect, test } from 'bun:test';

import { REPOSITORY_FILE_LIMIT, repositoryBlob, repositoryImageType } from './repository-blob';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('repositoryBlob', () => {
  test('UTF-8 without NUL is text', () => {
    expect(repositoryBlob('src/a.ts', encode('const é = 1;\n'))).toEqual({
      kind: 'text',
      size: 14,
      text: 'const é = 1;\n',
    });
  });

  test('a NUL byte early on is binary', () => {
    expect(repositoryBlob('a.bin', new Uint8Array([1, 0, 2]))).toEqual({ kind: 'binary', size: 3 });
  });

  test('invalid UTF-8 is binary', () => {
    expect(repositoryBlob('a.txt', new Uint8Array([255, 254, 65])).kind).toBe('binary');
  });

  test('an image by its extension becomes a data URL', () => {
    const blob = repositoryBlob('docs/Logo.PNG', new Uint8Array([137, 80, 78, 71]));
    expect(blob).toEqual({ kind: 'image', size: 4, dataUrl: 'data:image/png;base64,iVBORw==' });
  });

  test('an SVG is an image, never text', () => {
    expect(repositoryBlob('icon.svg', encode('<svg/>')).kind).toBe('image');
  });

  test('past the limit only the size is kept', () => {
    const blob = repositoryBlob('big.txt', new Uint8Array(REPOSITORY_FILE_LIMIT + 1));
    expect(blob).toEqual({ kind: 'too-large', size: REPOSITORY_FILE_LIMIT + 1 });
  });

  test('an empty file is empty text', () => {
    expect(repositoryBlob('empty', new Uint8Array())).toEqual({ kind: 'text', size: 0, text: '' });
  });

  test('an image type comes from the extension', () => {
    expect(repositoryImageType('a/b.JPG')).toBe('image/jpeg');
    expect(repositoryImageType('a/b.md')).toBeNull();
    expect(repositoryImageType('png')).toBeNull();
  });
});
