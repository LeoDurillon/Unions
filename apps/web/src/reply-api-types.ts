// What the API answers about replies to a pull request's comments: those being posted, the implementer's suggestions, who posts.

/** A reply the user sent that the worker has not posted yet (or that failed, until its event is read). */
export type PendingReply = {
  commandId: number;
  target: { kind: 'thread'; threadId: string } | { kind: 'note'; url: string };
  body: string;
  createdAt: number;
};

/** The implementer's reply to a comment imported from GitHub, under the thread or note it answers. */
export type SuggestedReply = {
  commentId: number;
  /** The imported comment's URL: a thread's first comment, or the note itself. */
  githubUrl: string;
  kind: 'line' | 'general';
  body: string;
  resolve: boolean;
  status: 'draft' | 'sending';
  /** `user` once edited. */
  author: 'user' | 'agent';
  /** GitHub's reason the last send failed. */
  error: string | null;
};

/** The replies of one pull request, as the Comments and PR tabs show them. */
export type RepliesResponse = {
  number: number;
  pending: PendingReply[];
  suggested: SuggestedReply[];
  /** Under the reply box: "Posts as @union-app[bot]", or why nothing can be posted. */
  postsAs: string;
  canPost: boolean;
};
