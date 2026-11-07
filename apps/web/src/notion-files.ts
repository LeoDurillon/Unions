// Downloads the images and files a Notion page holds (their links expire within the hour) so they can be
// kept as the ticket's files: each kept one is referenced as `attachment:<name>` in the markdown.
import { fetchTrackerFiles, type FileSource, type TrackerFile } from './tracker-files';

/** Notion serves a page's files from its own S3 bucket, behind links signed for an hour. */
function isNotionFile(url: string): boolean {
  const { hostname, protocol } = new URL(url);
  return (
    protocol === 'https:' &&
    ((hostname.startsWith('prod-files-secure.s3.') && hostname.endsWith('.amazonaws.com')) ||
      hostname === 'file.notion.so')
  );
}

const NOTION_FILES: FileSource = {
  isFile: isNotionFile,
  get: (url, signal, fetchFn) => fetchFn(url, { signal }),
  // Notion's names are upload ids: images are numbered, files named as Notion serves them.
  imagePrefix: 'notion',
  nameFromText: false,
  fallbackName: 'notion-file',
};

/**
 * Downloads the images and files a Notion page holds (their links expire within the hour) so they
 * can be kept as the ticket's files. Images come first; one that cannot be fetched, or would pass
 * the ticket's limit, keeps its link.
 */
export function fetchNotionFiles(
  markdown: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ markdown: string; files: TrackerFile[] }> {
  return fetchTrackerFiles(markdown, NOTION_FILES, fetchFn);
}
