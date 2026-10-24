// What a review's Specs bar reads: each spec, with the text to use now or why it could not be read.
import type { SavedSpecEntry } from '@union/core';

/**
 * A spec of the review as saved (`text`: the user's edit, null: the source's), with `current`, the
 * text the agents get now (the edit, or the source read now), or `error` when the source failed.
 */
export type ReviewSpecView = SavedSpecEntry & { current: string | null; error: string | null };
