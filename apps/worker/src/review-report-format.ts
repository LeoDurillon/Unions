// What the report agent reads and answers in: the specs, numbered, and the answer's block.
import type { ReportSpec } from '@union/core';

import { HUNK_INDEX } from './review-grouping-format';

/** At most this many important files are kept, in the agent's order. */
export const MAX_IMPORTANT_FILES = 8;
/** Of which at most this many the change does not touch. */
export const MAX_UNCHANGED_FILES = 2;

/** Appended by the host, never editable: the report is read from this block. */
export const REPORT_FORMAT = `End your answer with one fenced \`json\` block, and nothing after it:

\`\`\`json
{"verdict": "partial",
 "summary": "what the change does and how it meets the specs, in a few sentences",
 "importantFiles": [{"path": "src/campaign/activate.ts", "why": "why the reviewer reads it first", "kind": "core", "lines": [{"start": 40, "end": 72}], "requirements": ["automatic-unpublishing"]}],
 "requirements": [{"key": "automatic-unpublishing", "title": "Automatic unpublishing", "spec": "the spec's words, quoted exactly", "specId": 1, "status": "done", "evidence": [{"path": "src/campaign/activate.ts", "start": 40, "end": 72}], "tests": ["src/campaign/activate.test.ts"], "note": "what is missing or different, and what to check"}],
 "outOfScope": [{"path": "package.json", "reason": "dependency bump", "risk": "low"}, {"path": "src/campaign/api.ts", "lines": [310], "reason": "renames a helper", "risk": "low"}],
 "risks": [{"title": "Migration locks the table", "detail": "why and when it bites", "paths": ["db/0042.sql"], "severity": "high"}],
 "questions": ["an ambiguity of the specs, or an assumption the change makes"],
 "docs": [{"path": "docs/campaigns.md", "note": "what it should now say"}]}
\`\`\`

- \`verdict\`: \`matches\` (every requirement done), \`partial\` (some partial or missing) or \`diverges\` (the change does something else than the specs ask).
- \`importantFiles\`: the files to read first, in the order to read them, at most ${MAX_IMPORTANT_FILES}. \`kind\` is one of \`core\`, \`risky\`, \`entry\`, \`migration\`, \`api\`, \`test\`. You may list up to ${MAX_UNCHANGED_FILES} files the change does not touch but depends on.
- \`requirements\`: one per requirement of the specs, in their order. \`spec\` quotes the spec's own words; \`specId\` is the number of the spec it comes from. \`status\` is one of \`done\`, \`partial\`, \`missing\`, \`differs\` (done another way than the spec says), \`unclear\` (the spec is ambiguous here). \`evidence\` and \`tests\`: paths as in the repository, lines of the files as they are now.
- \`outOfScope\`: changes no requirement asked for: a whole file, or some of its hunks with \`lines\`, each hunk named by its line in \`${HUNK_INDEX}\`. \`risk\` is \`low\`, \`medium\` or \`high\`.
- \`risks\`: what could break beyond the specs; \`severity\` is \`low\`, \`medium\` or \`high\`.
- \`docs\`: the repository's own documents the change should have updated and did not.
- Leave a list empty rather than fill it.`;

/** The specs, each a titled section with the number the agent cites it by. */
export function specSections(specs: ReportSpec[]): string {
  return specs.map((spec) => `### Spec ${spec.id}: ${spec.label}\n\n${spec.text}`).join('\n\n');
}
