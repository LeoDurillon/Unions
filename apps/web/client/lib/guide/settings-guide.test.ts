import { describe, expect, test } from 'bun:test';
import path from 'node:path';

import { headingSlug } from '../markdown/heading-slug';
import { UNION_SETTINGS_GROUPS } from '../union-settings/union-settings-groups';
import { PROJECT_GUIDE, unionSettingsGuide, type GuideTarget } from './settings-guide';

const GUIDE = path.join(import.meta.dir, '../../../../../documentation');

/** The heading ids of a guide page, as the Guide page gives them. */
async function anchors(page: string): Promise<string[]> {
  const text = await Bun.file(path.join(GUIDE, `${page}.md`)).text();
  return [...text.matchAll(/^#{1,6} (?<title>.+)$/gmu)].map((match) =>
    headingSlug((match.groups?.title ?? '').replaceAll(/[*`]/gu, '')),
  );
}

async function expectInGuide([page, anchor]: GuideTarget): Promise<void> {
  expect(await anchors(page)).toContain(anchor);
}

describe('settings Learn more links', () => {
  test('every project settings page links to a heading of the guide', async () => {
    for (const target of Object.values(PROJECT_GUIDE)) {
      await expectInGuide(target);
    }
  });

  test('every Union settings page links to a heading of the guide', async () => {
    for (const section of UNION_SETTINGS_GROUPS.flatMap((group) => group.sections)) {
      await expectInGuide(unionSettingsGuide(section));
    }
    expect(unionSettingsGuide('agent_3')).toEqual(['agents', 'custom-agents']);
    await expectInGuide(unionSettingsGuide('agent_3'));
  });
});
