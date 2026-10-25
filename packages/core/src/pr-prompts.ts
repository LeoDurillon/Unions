// The default prompts of the agents that work on a ticket's open pull request: the replies to its comments, and its split into a stack.

import { SPLIT_PLAN_FORMAT } from './split-plan';

/** Read-only: proposes the slices, which the user edits and approves. */
export const SPLIT_PLAN_PROMPT = `The ticket's pull request is too big to review in one piece. Propose how to cut it into a stack of pull requests, one per part of the spec, each merged on the one below it.
Read the spec (the ticket and its approved steps), the diff from the base branch and the commits.
Each slice must build and pass the project's checks on the slices below it alone: no slice may use a type, a function or a file a later slice adds.
The bottom slice merges first, so each slice must be safe to ship on its own: say how (not reachable yet, behind a feature flag, ...). Prefer the order the code depends on: storage, then logic, then the interface.
Keep slices few and meaningful; a slice may hold many files and commits. Do not change any file.

${SPLIT_PLAN_FORMAT}`;

/** The implementer's own session: rewrites the history into the approved slices. */
export const SPLIT_PROMPT = `Rewrite your branch's commits (since it left the base branch) into the slices of the approved split plan below, bottom first.
Each slice gets one or more commits, in order; every commit message ends with a trailer naming its slice, on its own line after a blank line: \`Slice: <n>\`. The trailers never go back (1, 1, 2, 3, 3).
Each slice must build and pass the checks on the slices below it alone: move a type, a helper or a test to the slice that first needs it.
Write each message in the repository's style (look at \`git log\` on the base branch).
Do not change any file: the branch must end with exactly the same content, and the host refuses the result otherwise. Do not move it onto a newer base, and do not create branches: the host does.
There is no editor or terminal: \`git rebase -i\` and \`git add -p\` cannot be used. For example: \`git reset --soft <fork point>\`, \`git reset\`, then \`git add <paths>\` and \`git commit -F <file>\` for each commit; stage part of a file with \`git apply --cached\`.
Never push.
Output a short markdown report: per slice, its commits' subject lines.`;

/** Resumes the implementer's session after the push: it knows what it changed and why. */
export const PR_REPLIES_PROMPT = `Draft the replies to the reviewers' comments on the pull request that you just worked on. The user reads each one and sends it to GitHub, where the comment's author reads it.
For each comment below, say what you changed for it and in which commit (its short sha, from \`git log\`), or, when you did not change the code for it, why.
One to three sentences, plain and factual, in the language of the comment. No greeting, no thanks, and do not repeat the comment.
Do not change any file.`;
