// The cases every `TrackerAdapter` passes against its fake API: what a new tracker must do to be one. Test helper.
// Each adapter's test calls `adapterContract` with its fixture; its own tests then cover only its formats.

import { describe, expect, test } from 'bun:test';

import { commentsCases } from './adapter-contract-comments';
import { fieldsCases, type FieldsFixture } from './adapter-contract-fields';
import { integrationKind } from './kinds';
import { ItemOutsideSourceError } from './provider';
import { capabilitiesOf, type TrackerAdapter } from './tracker-adapter';

/** What the fake API holds, as the cases read it. */
export type ContractFixture = {
  adapter: TrackerAdapter;
  secret: string;
  config: unknown;
  /** An item of the integration's source: its id, a link to it, its title. */
  item: { id: string; link: string; title: string };
  /** The id of an item that exists outside the source (another data source, another project). */
  outside: string;
  /** A link to an item of another site, for trackers with sites; null for the others. */
  otherSite: string | null;
  /** Texts as a pull request has them (title, branch, description), and the items they name in order. */
  named: { texts: string[]; ids: string[] };
  /** The tracker's markdown as stored on an imported ticket, and as plain markdown. */
  markdown: { raw: string; clean: string };
  /** An item with at least one thread of comments (one whose author can be mentioned, for mention replies). */
  commented: string;
  /** A settable field of an item and a value it takes, and what the fake was sent. */
  fields: Omit<FieldsFixture, 'adapter' | 'access'>;
};

function required<T>(capability: T | undefined, name: string): T {
  if (capability === undefined) {
    throw new Error(`The adapter has no ${name} capability`);
  }
  return capability;
}

function refsCases(fixture: ContractFixture): void {
  const { adapter, config, item } = fixture;
  test('names an item by its link or its id, and nothing else', () => {
    const refs = required(adapter.refs, 'refs');
    expect(refs.parse(item.link)).toBe(item.id);
    expect(refs.parse(item.id)).toBe(item.id);
    expect(refs.parse('not a link')).toBeNull();
    expect(refs.error(item.link, config)).toBeNull();
  });
  test.if(fixture.otherSite !== null)('refuses a link of another site, and says why', () => {
    const refs = required(adapter.refs, 'refs');
    expect(refs.error(fixture.otherSite ?? '', config)).toBeString();
  });
  test('finds the items a text names, once each, in order', () => {
    const refs = required(adapter.refs, 'refs');
    expect(refs.namedIn(fixture.named.texts, config)).toEqual(fixture.named.ids);
    expect(refs.namedIn([], config)).toEqual([]);
  });
}

/** A fetch that fails the case when it is called. */
const refuseFetch: typeof fetch = Object.assign(
  (): Promise<Response> => Promise.reject(new Error('Fetched a link')),
  { preconnect: fetch.preconnect },
);

export function adapterContract(fixture: ContractFixture): void {
  const { adapter, secret, config, item } = fixture;
  const kind = integrationKind(adapter.kind);
  describe(`${kind.label} adapter contract`, () => {
    test('the kind names the capabilities the adapter has', () => {
      expect(capabilitiesOf(adapter)).toEqual([...kind.capabilities]);
    });
    test('imports an item of the source, its link naming it', async () => {
      const read = await adapter.item(secret, config, item.id);
      expect(read).toMatchObject({ id: item.id, title: item.title });
      expect(required(adapter.refs, 'refs').parse(read.url)).toBe(item.id);
    });
    test('refuses an item outside the source', async () => {
      const refused = await adapter.item(secret, config, fixture.outside).then(
        () => null,
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(ItemOutsideSourceError);
    });
    refsCases(fixture);
    commentsCases({ adapter, secret, config, itemId: fixture.commented });
    fieldsCases({ adapter, access: { secret, config, fields: null }, ...fixture.fields });
    test("downloads none of a text's links that are not the tracker's files", async () => {
      const text =
        'See [the docs](https://example.com/guide.pdf) and ![a chart](https://example.com/c.png)';
      const kept = await required(adapter.files, 'files').fetch(
        text,
        { secret, config, fields: null },
        refuseFetch,
      );
      expect(kept).toEqual({ markdown: text, files: [] });
    });
    test("reads the tracker's markdown as plain markdown", () => {
      expect(required(adapter.text, 'text').markdown(fixture.markdown.raw)).toBe(
        fixture.markdown.clean,
      );
    });
  });
}
