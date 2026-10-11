import { NotionError } from './notion-error';

const API = 'https://api.notion.com/v1';
/** Required by the markdown endpoint, and the only value it accepts. */
const NOTION_VERSION = '2026-03-11';
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

export type NotionPage = { id: string; title: string; url: string; dataSourceId: string | null };

/** The Notion calls the web server makes. Tests substitute a fake. */
export type NotionApi = {
  dataSourceTitle(token: string, dataSourceId: string): Promise<string>;
  page(token: string, pageId: string): Promise<NotionPage>;
  pageMarkdown(token: string, pageId: string): Promise<{ markdown: string; truncated: boolean }>;
};

/** Rich text arrays to plain text; anything unexpected reads as empty. */
function plain(texts: unknown): string {
  if (!Array.isArray(texts)) {
    return '';
  }
  return texts
    .map((text: unknown) =>
      isRecord(text) && typeof text.plain_text === 'string' ? text.plain_text : '',
    )
    .join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function titleOf(properties: unknown): string {
  if (!isRecord(properties)) {
    return '';
  }
  const title = Object.values(properties).find(
    (property) => isRecord(property) && property.type === 'title',
  );
  return isRecord(title) ? plain(title.title) : '';
}

export class FetchNotionApi implements NotionApi {
  private async get(token: string, path: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${token}`, 'notion-version': NOTION_VERSION },
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.status === UNAUTHORIZED) {
      throw new NotionError('Notion rejected this token.', UNAUTHORIZED);
    }
    if (response.status === NOT_FOUND) {
      throw new NotionError(
        'Not found, or not shared with the Notion integration (Share → Connections).',
        NOT_FOUND,
      );
    }
    if (!response.ok || !isRecord(body)) {
      const message =
        isRecord(body) && typeof body.message === 'string' ? body.message : response.statusText;
      throw new NotionError(`Notion: ${message}`, response.status);
    }
    return body;
  }

  async dataSourceTitle(token: string, dataSourceId: string): Promise<string> {
    const body = await this.get(token, `/data_sources/${dataSourceId}`);
    return plain(body.title);
  }

  async page(token: string, pageId: string): Promise<NotionPage> {
    const body = await this.get(token, `/pages/${pageId}`);
    const { parent } = body;
    const dataSourceId =
      isRecord(parent) &&
      parent.type === 'data_source_id' &&
      typeof parent.data_source_id === 'string'
        ? parent.data_source_id
        : null;
    return {
      id: String(body.id),
      title: titleOf(body.properties),
      url: typeof body.url === 'string' ? body.url : '',
      dataSourceId,
    };
  }

  async pageMarkdown(
    token: string,
    pageId: string,
  ): Promise<{ markdown: string; truncated: boolean }> {
    const body = await this.get(token, `/pages/${pageId}/markdown`);
    return {
      markdown: typeof body.markdown === 'string' ? body.markdown : '',
      truncated: body.truncated === true,
    };
  }
}
