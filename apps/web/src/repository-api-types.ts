// The Repository tab's answers: the commit a branch or sha names, the folders and files at it, one file.
export type { RepositoryBlob } from '@union/core/repository-blob';

/** The commit the tab shows, resolved from what the user asked for. */
export type RepositoryCommit = {
  /** What was asked: a branch, a tag or a sha (the base branch when nothing was). */
  ref: string;
  sha: string;
  /** The commit's root folder, read for the tree. */
  treeSha: string;
  /** The first line of the commit message. */
  message: string;
  author: string | null;
  date: string | null;
  url: string;
};

export type RepositoryEntryType = 'file' | 'dir' | 'link' | 'submodule';

/** A file or folder of the tree, by its full path from the root. */
export type RepositoryEntry = {
  path: string;
  type: RepositoryEntryType;
  /** Bytes, for files and links only. */
  size: number | null;
  /** The blob's sha for a file, the folder's tree sha, a submodule's commit. */
  sha: string;
};

/**
 * The tree under a folder. `truncated`: GitHub stopped the recursive listing (a very large repository), so only
 * the root level came back and each folder is read when it opens.
 */
export type RepositoryTree = { entries: RepositoryEntry[]; truncated: boolean };
