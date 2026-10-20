import { expect, test } from 'bun:test';

import { mentionedUrls, notionMarkdown } from './notion-markdown';

const PAGE = 'https://app.notion.com/p/3aa71918294580298940c2394c835f34';

test('a page mention becomes a link, titled when the title is known', () => {
  const line = `voir <mention-page url="${PAGE}"/> `;
  expect(notionMarkdown(line)).toBe(`voir [Notion page](${PAGE}) `);
  expect(notionMarkdown(line, { [PAGE]: 'Masquer le simulateur' })).toBe(
    `voir [Masquer le simulateur](${PAGE}) `,
  );
  expect(mentionedUrls(`${line} ${line}`)).toEqual([PAGE]);
  expect(notionMarkdown('le <mention-date start="2026-10-01" end="2026-10-31"/>')).toBe(
    'le 2026-10-01 → 2026-10-31',
  );
});

test('a link preview becomes its source as a plain link', () => {
  const figma = 'https://www.figma.com/design/iehz/Subs?node-id=1339-6499&t=iyeq-1';
  const line = `Maquette : <link-preview url="${PAGE}#3c37" source="${figma.replace('&', '&amp;')}" />`;
  expect(notionMarkdown(line)).toBe(`Maquette : ${figma}`);
  expect(notionMarkdown(`<link-preview url="${PAGE}"></link-preview>`)).toBe(PAGE);
});

test('a callout becomes a quote, its icon first and its lines no longer indented', () => {
  const callout = [
    '<callout icon="🎯" color="gray_bg">',
    '\t**Scope du ticket**',
    '\t- Rendre disabled les boutons',
    '\t- Afficher un texte',
    '</callout>',
    '# 📜Spécifications',
  ].join('\n');
  expect(notionMarkdown(callout)).toBe(
    [
      '> 🎯 **Scope du ticket**',
      '> - Rendre disabled les boutons',
      '> - Afficher un texte',
      '# 📜Spécifications',
    ].join('\n'),
  );
});

test('commented and colored spans keep only their text', () => {
  const line =
    'et<span discussion-urls="discussion://a/b"> </span>**~~<span discussion-urls="discussion://a/b">traçable</span>**<span color="blue" discussion-urls="x"><span color="red">(log)</span></span>~~';
  expect(notionMarkdown(line)).toBe('et **~~traçable**(log)~~');
});

test('a toggle heading loses its attribute, and its children their tab (they are not code)', () => {
  const toggle = [
    '## Cas limites {toggle="true"}',
    '\t- Campagne active :',
    '\t\t- bloquer la publication',
    '## Suite',
    '- [ ] fait',
  ].join('\n');
  expect(notionMarkdown(toggle)).toBe(
    [
      '## Cas limites',
      '- Campagne active :',
      '\t- bloquer la publication',
      '## Suite',
      '- [ ] fait',
    ].join('\n'),
  );
});

test('clean markdown is left as it is, so cleaning twice changes nothing', () => {
  const clean = '# Titre\n\n- a\n\t- b\n\n> quote\n\n![](attachment:notion-image-1.png)';
  expect(notionMarkdown(clean)).toBe(clean);
  const once = notionMarkdown('<callout icon="💡">\n\tTip <span>x</span>\n</callout>');
  expect(notionMarkdown(once)).toBe(once);
});
