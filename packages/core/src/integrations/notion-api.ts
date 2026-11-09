// The Notion calls Union makes (`NotionApi`), and the client that makes them over fetch.
import { commentOf, commentsOf, type NotionComment } from './notion-comment-parse';
import { NotionError } from './notion-error';
import type { NotionRichTextInput } from './notion-rich-text';
import { resolveUnknownBlocks } from './notion-unknown-blocks';

const API = 'https://api.notion.com/v1';
/** Required by the markdown endpoint, and the only value it accepts. */
const NOTION_VERSION = '2026-03-11';
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
/** 100 members a page: enough for any team Union serves. */
const MAX_USER_PAGES = 10;
/** 100 comments a page: a block with more open comments than this is not a discussion one reads. */
const MAX_COMMENT_PAGES = 10;

export type NotionPage = { id: string; title: string; url: string; dataSourceId: string | null };

/** A column of a data source: its id (stable across renames), name, type, and choices if any. */
export type NotionProperty = { id: string; name: string; type: string; options: string[] };

export type NotionDataSource = { title: string; properties: NotionProperty[] };

/** A member of the workspace (not a bot): what a person property holds. */
export type NotionUser = { id: string; name: string };

/** The Notion calls Union makes. Tests substitute a fake. */
export type NotionApi = {
  dataSourceTitle(token: string, dataSourceId: string): Promise<string>;
  dataSource(token: string, dataSourceId: string): Promise<NotionDataSource>;
  page(token: string, pageId: string): Promise<NotionPage>;
  /** The page as markdown, with the blocks Notion leaves unrendered read as their links. */
  pageMarkdown(token: string, pageId: string): Promise<{ markdown: string; truncated: boolean }>;
  /** The workspace members; needs the integration's "Read user information" capability. */
  users(token: string): Promise<NotionUser[]>;
  /**
   * The open (unresolved) comments of a page or of one block, oldest first; needs the integration's
   * "Read comments" capability. A page's list also holds comments on whole blocks of it.
   */
  comments(token: string, blockId: string): Promise<NotionComment[]>;
  /**
   * Posts a comment: a reply in a discussion, or a new discussion on the page. Needs the
   * integration's "Insert comments" capability; Notion shows it under the integration's name.
   */
  addComment(
    token: string,
    target: { discussionId: string } | { pageId: string },
    richText: NotionRichTextInput[],
  ): Promise<NotionComment>;
  /** Sets page properties, keyed by property id, in Notion's property value shape. */
  updatePage(token: string, pageId: string, properties: Record<string, unknown>): Promise<void>;
  /** Adds a page to the data source, with this title and markdown content. */
  createPage(
    token: string,
    dataSourceId: string,
    page: { title: string; markdown: string },
  ): Promise<NotionPage>;
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

/** The choices of a select, multi-select or status column; empty for the other types. */
function optionsOf(property: Record<string, unknown>): string[] {
  const config = property[String(property.type)];
  const options = isRecord(config) ? config.options : undefined;
  return Array.isArray(options)
    ? options.flatMap((option: unknown) =>
        isRecord(option) && typeof option.name === 'string' ? [option.name] : [],
      )
    : [];
}

function usersOf(results: unknown): NotionUser[] {
  if (!Array.isArray(results)) {
    return [];
  }
  return results.flatMap((user: unknown) =>
    isRecord(user) && user.type === 'person' && typeof user.id === 'string'
      ? [{ id: user.id, name: typeof user.name === 'string' ? user.name : user.id }]
      : [],
  );
}

function propertiesOf(properties: unknown): NotionProperty[] {
  if (!isRecord(properties)) {
    return [];
  }
  return Object.entries(properties).flatMap(([name, property]) =>
    isRecord(property) && typeof property.id === 'string' && typeof property.type === 'string'
      ? [{ id: property.id, name, type: property.type, options: optionsOf(property) }]
      : [],
  );
}

function pageOf(body: Record<string, unknown>): NotionPage {
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

export class FetchNotionApi implements NotionApi {
  private get(token: string, path: string): Promise<Record<string, unknown>> {
    return this.send(path, {
      headers: { authorization: `Bearer ${token}`, 'notion-version': NOTION_VERSION },
    });
  }

  private write(
    method: 'PATCH' | 'POST',
    token: string,
    path: string,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return this.send(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'notion-version': NOTION_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  private async send(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`${API}${path}`, init);
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
    const source = await this.dataSource(token, dataSourceId);
    return source.title;
  }

  async dataSource(token: string, dataSourceId: string): Promise<NotionDataSource> {
    const body = await this.get(token, `/data_sources/${dataSourceId}`);
    return { title: plain(body.title), properties: propertiesOf(body.properties) };
  }

  /** The `results` of every page of a list (`path` has a query), up to `maxPages` pages. */
  private async listAll(token: string, path: string, maxPages: number): Promise<unknown[]> {
    const results: unknown[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      const query: string = cursor === null ? '' : `&start_cursor=${encodeURIComponent(cursor)}`;
      // Pages follow one another: each needs the cursor of the one before.
      // oxlint-disable-next-line no-await-in-loop
      const body = await this.get(token, `${path}${query}`);
      const pageResults: unknown[] = Array.isArray(body.results) ? body.results : [];
      results.push(...pageResults);
      if (body.has_more !== true || typeof body.next_cursor !== 'string') {
        break;
      }
      cursor = body.next_cursor;
    }
    return results;
  }

  async users(token: string): Promise<NotionUser[]> {
    const results = await this.listAll(token, '/users?page_size=100', MAX_USER_PAGES);
    return usersOf(results).toSorted((left, right) => left.name.localeCompare(right.name));
  }

  async comments(token: string, blockId: string): Promise<NotionComment[]> {
    const path = `/comments?block_id=${encodeURIComponent(blockId)}&page_size=100`;
    return commentsOf(await this.listAll(token, path, MAX_COMMENT_PAGES));
  }

  async addComment(
    token: string,
    target: { discussionId: string } | { pageId: string },
    richText: NotionRichTextInput[],
  ): Promise<NotionComment> {
    const where =
      'discussionId' in target
        ? { discussion_id: target.discussionId }
        : { parent: { page_id: target.pageId } };
    const comment = commentOf(
      await this.write('POST', token, '/comments', { ...where, rich_text: richText }),
    );
    if (!comment) {
      throw new Error('Notion posted the comment but its answer could not be read');
    }
    return comment;
  }

  async updatePage(
    token: string,
    pageId: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    await this.write('PATCH', token, `/pages/${pageId}`, { properties });
  }

  async createPage(
    token: string,
    dataSourceId: string,
    page: { title: string; markdown: string },
  ): Promise<NotionPage> {
    // The title column's id is `title` in every data source.
    const body = await this.write('POST', token, '/pages', {
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: { title: { title: [{ type: 'text', text: { content: page.title } }] } },
      markdown: page.markdown,
    });
    return pageOf(body);
  }

  async page(token: string, pageId: string): Promise<NotionPage> {
    return pageOf(await this.get(token, `/pages/${pageId}`));
  }

  async pageMarkdown(
    token: string,
    pageId: string,
  ): Promise<{ markdown: string; truncated: boolean }> {
    const body = await this.get(token, `/pages/${pageId}/markdown`);
    const markdown = typeof body.markdown === 'string' ? body.markdown : '';
    return {
      // The markdown leaves some blocks (a connected Figma preview) as `<unknown>`: read their links.
      markdown: await resolveUnknownBlocks(markdown, (id) => this.get(token, `/blocks/${id}`)),
      truncated: body.truncated === true,
    };
  }
}
