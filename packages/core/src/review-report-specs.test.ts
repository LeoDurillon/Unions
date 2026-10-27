import { expect, test } from 'bun:test';

import { distinctSpecs, quoteKey, withoutImages } from './review-report-specs';

test('images become numbered placeholders, links and all', () => {
  expect(
    withoutImages(
      'a\n![](https://s3.example/x.png?X-Amz-Signature=abc)\nb ![shot](attachment:y.png)',
    ),
  ).toBe('a\n[image 1]\nb [image 2]');
});

test('a quote matches its spec whatever the markdown marks, escapes and quote signs', () => {
  const spec =
    'Sous forme de texte “**Table de palier de revenus : MPR**”\n- si seuil connu, “seuil : \\{seuil\\}';
  expect(quoteKey(spec)).toContain(quoteKey('texte "Table de palier de revenus : MPR"'));
  expect(quoteKey(spec)).toContain(quoteKey('seuil : {seuil}'));
  expect(quoteKey('l’ensemble')).toBe(quoteKey("l'ensemble"));
});

const NOTION = `# Contexte
Les ingefi souhaitent voir le seuil.
![](https://s3.example/a.png?sig=1)
- dans la vue d’ensemble, ajouter la table
- [ ]
`;
const TICKET = `${NOTION.replace('https://s3.example/a.png?sig=1', 'attachment:notion-image-1.png')}
---
Imported from Notion: https://app.notion.com/p/x`;

test('a spec another one holds is kept as the same, without its text', () => {
  const specs = distinctSpecs([
    { kind: 'ticket', label: 'Ticket description', text: TICKET },
    { kind: 'notion', label: 'Notion: Seuil', text: NOTION },
    { kind: 'pr', label: 'Pull request', text: 'Adds the threshold line.' },
  ]);
  expect(specs.map((spec) => [spec.id, spec.label, spec.sameAs ?? null])).toEqual([
    [1, 'Ticket description', null],
    [2, 'Notion: Seuil', 1],
    [3, 'Pull request', null],
  ]);
  expect(specs[0]?.text).toContain('[image 1]');
  expect(specs[1]?.text).toBe('');
});

test('a longer spec holding a shorter one is the one sent', () => {
  const specs = distinctSpecs([
    { kind: 'ticket', label: 'Short', text: 'one line\ntwo line' },
    { kind: 'notion', label: 'Long', text: 'one line\ntwo line\nthree line' },
  ]);
  expect(specs.map((spec) => spec.sameAs ?? null)).toEqual([2, null]);
});
