import { expect, test } from 'bun:test';

import { standaloneSvg, svgSize } from './diagram-export';

const MERMAID_SVG =
  '<svg id="m" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 450px;" viewBox="-50 -10 450 259" role="graphics-document"><style>#m{fill:red}</style><g><rect width="150" height="65"/></g></svg>';

test('a diagram file takes its pixel size from its viewBox and a white background', () => {
  const size = svgSize(MERMAID_SVG);
  expect(size).toEqual({ width: 450, height: 259 });
  if (!size) {
    return;
  }
  const file = standaloneSvg(MERMAID_SVG, size);
  const root = file.slice(0, file.indexOf('>') + 1);
  expect(root).toContain('width="450" height="259"');
  expect(root).toContain('background-color: white');
  expect(root).not.toContain('100%');
  expect(root).not.toContain('max-width');
  // Only the root changes: the shapes inside keep their own sizes.
  expect(file).toContain('<rect width="150" height="65"/>');
});

test('an SVG without a viewBox has no size', () => {
  expect(svgSize('<svg width="100%"><g/></svg>')).toBeNull();
});
