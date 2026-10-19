// The titles of the Notion pages a page's markdown mentions, so its links read as titles.
import { mentionedUrls, parseNotionId, type NotionApi } from '@union/core';

const MAX_TITLED_MENTIONS = 10;

/** The titles of the pages a markdown mentions (a few, best effort: a link without one still works). */
export async function mentionTitles(
  notion: NotionApi,
  token: string,
  markdown: string,
): Promise<Record<string, string>> {
  const found = await Promise.all(
    mentionedUrls(markdown)
      .slice(0, MAX_TITLED_MENTIONS)
      .map(async (url) => {
        const id = parseNotionId(url);
        const title = id
          ? await notion.page(token, id).then(
              (page) => page.title,
              () => '',
            )
          : '';
        return [url, title] as const;
      }),
  );
  return Object.fromEntries(found.filter(([, title]) => title !== ''));
}
