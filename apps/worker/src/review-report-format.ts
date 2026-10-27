// What the report agent reads and answers in: the specs, numbered, and the answer's block.
import type { ReportSpec } from '@union/core';

import { HUNK_INDEX } from './review-grouping-format';

/** At most this many important files are kept, in the agent's order. */
export const MAX_IMPORTANT_FILES = 8;
/** Of which at most this many the change does not touch. */
export const MAX_UNCHANGED_FILES = 2;

/** At most this many items need the reviewer, as the agent ranks them (the host adds the gaps it left out). */
export const MAX_ATTENTION = 5;

/** The map of how the change works: at most this many nodes, edges and walkthrough steps. */
export const MAX_FLOW_NODES = 12;
export const MAX_FLOW_EDGES = 24;
export const MAX_FLOW_STEPS = 6;

/** Appended by the host, never editable: the report is read from this block. */
export const REPORT_FORMAT = `End your answer with one fenced \`json\` block, and nothing after it:

\`\`\`json
{"verdict": "partial",
 "summary": "the decision first: what needs the reviewer, then what they can trust; at most 3 sentences",
 "flow": {"nodes": [{"id": "page", "label": "Campaign page", "path": "src/pages/campaign.tsx", "lines": {"start": 30, "end": 45}}, {"id": "header", "label": "Campaign header", "path": "src/campaign/header.tsx"}],
  "edges": [{"from": "page", "to": "header", "label": "passes the table's name"}],
  "steps": [{"title": "The page loads the project", "what": "what happens, in one or two sentences", "why": "why it is done this way", "source": "commit", "quote": "the commit message's own words", "nodes": ["page"]}]},
 "attention": [{"kind": "differs", "title": "the label says 'paliers', the spec 'palier'", "detail": "why it matters, in one sentence", "requirement": "automatic-unpublishing", "lines": [{"path": "src/campaign/header.tsx", "start": 47, "end": 51}]}],
 "importantFiles": [{"path": "src/campaign/activate.ts", "why": "why the reviewer reads it first", "kind": "core", "lines": [{"start": 40, "end": 72}], "requirements": ["automatic-unpublishing"]}],
 "skim": [{"path": "src/campaign/index.ts", "why": "exports the new helper"}],
 "requirements": [{"key": "automatic-unpublishing", "title": "Automatic unpublishing", "spec": "the spec's words, quoted exactly", "specId": 1, "status": "done", "evidence": [{"path": "src/campaign/activate.ts", "start": 40, "end": 72}], "tests": ["src/campaign/activate.test.ts"], "note": "what is missing or different, and what to check", "unasked": "behaviour this code adds that the spec did not ask for, in one sentence; empty when none"}],
 "outOfScope": [{"path": "package.json", "reason": "dependency bump", "risk": "low"}, {"path": "src/campaign/api.ts", "lines": [310], "reason": "renames a helper", "risk": "low"}],
 "risks": [{"title": "Migration locks the table", "detail": "why and when it bites", "paths": ["db/0042.sql"], "severity": "high"}],
 "questions": ["what the author or the spec's owner must answer before this can be approved"],
 "docs": [{"path": "docs/campaigns.md", "note": "what it should now say"}]}
\`\`\`

The report is there to make the review faster: say what needs the reviewer, and what they can skim.

- \`verdict\`: \`matches\` only when every requirement is \`done\`; \`partial\` when some are partial, missing, done differently or unclear; \`diverges\` when the change does something else than the specs ask.
- \`flow\`: how the change works, for a reviewer who has not read it. \`nodes\`: the parts of the code on the change's main path (a file, or a function of it with its \`lines\`), at most ${MAX_FLOW_NODES}: the changed ones, and the few unchanged ones they rely on or that rely on them; no wiring, no tests. \`edges\`: how a node uses another, \`label\` a short verb phrase ("fetches the project", "renders", "computes the label with"). \`steps\`: 3 to ${MAX_FLOW_STEPS}, in the order things happen; \`what\` happens and \`why\` it is done this way. \`source\` says where the why comes from: \`spec\`, \`commit\` (a commit message of the change), \`comment\` (a code comment the change adds), with \`quote\` its own words; else \`inferred\`, without a quote. Never present a guess as sourced. \`nodes\`: the ids of the nodes the step is about.
- \`attention\`: what the reviewer must look at, most important first, at most ${MAX_ATTENTION}: a requirement done differently or missing, behaviour nobody asked for (\`unasked\`), a medium or high risk (also listed in \`risks\`, with that severity), a question that blocks approval. \`kind\` is one of \`differs\`, \`missing\`, \`partial\`, \`unasked\`, \`risk\`, \`question\`; \`requirement\` is the key of the requirement it is about, if any; \`lines\` are the lines to look at. Leave it empty when nothing needs the reviewer.
- \`importantFiles\`: the files to read first, in the order to read them, at most ${MAX_IMPORTANT_FILES}. \`kind\` is one of \`core\`, \`risky\`, \`entry\`, \`migration\`, \`api\`, \`test\`. You may list up to ${MAX_UNCHANGED_FILES} files the change does not touch but depends on.
- \`skim\`: the changed files the reviewer can skim (wiring, renames, generated files, tests that only mirror the code), each with why. Never a file of \`importantFiles\` or one an \`attention\` item points at.
- \`requirements\`: one per requirement of the specs, in their order. Take them from each spec's title and context too, not only from its lists: a title asking for something no list settles is a requirement, \`unclear\` when you cannot tell whether this change should do it. \`spec\` quotes the spec's own words; \`specId\` is the number of the spec it comes from. \`status\` is one of \`done\`, \`partial\`, \`missing\`, \`differs\` (done another way than the spec says), \`unclear\` (the spec is ambiguous here). Text the spec puts in quotes (a label, a message) must appear exactly as written, case and spelling included: any difference is \`differs\`, never \`done\`. When a spec's acceptance criteria or test scenarios are empty, say so in a question. \`evidence\` and \`tests\`: paths as in the repository, lines of the files as they are now. \`unasked\`: what this requirement's code does that the spec did not ask for (an extra case, a wider scope), even when the requirement is \`done\`; the host lists it among what needs the reviewer.
- \`outOfScope\`: changes no requirement needs: a whole file, or some of its hunks with \`lines\`, each hunk named by its line in \`${HUNK_INDEX}\`. Behaviour nobody asked for inside a requirement's code goes in that requirement's note and in \`attention\` as \`unasked\`, not here. \`risk\` is \`low\`, \`medium\` or \`high\`.
- \`risks\`: only what could break beyond the specs and would change a review comment: shared code changed without a test of its other users, a new way for a page or a request to fail, data, migrations, security, performance. \`severity\` is \`low\`, \`medium\` or \`high\`; shared code changed without a test of its other users is at least \`medium\`.
- \`questions\`: only the ones that block approval.
- \`docs\`: the repository's own documents the change should have updated and did not.
- Every changed file belongs somewhere: a requirement's evidence or tests, \`importantFiles\`, \`skim\` or \`outOfScope\`.
- Leave a list empty rather than fill it.`;

/** The specs, each a titled section with the number the agent cites it by; one another holds is not repeated. */
export function specSections(specs: ReportSpec[]): string {
  return specs
    .filter((spec) => spec.sameAs === undefined)
    .map((spec) => `### Spec ${spec.id}: ${spec.label}\n\n${spec.text}`)
    .join('\n\n');
}
