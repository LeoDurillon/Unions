// What a spec report holds: the specs it read, its verdict, the important files, each requirement's
// status, and what the spec did not ask for. Pure, browser-safe.
import type { SpecSource } from './spec-source-kinds';

/** A spec as the report's run sent it; `id` is the number the agent cites it by. */
export type ReportSpec = { id: number; kind: SpecSource; label: string; text: string };

const REPORT_VERDICTS = ['matches', 'partial', 'diverges'] as const;
export type ReportVerdict = (typeof REPORT_VERDICTS)[number];

export const REQUIREMENT_STATUSES = ['done', 'partial', 'missing', 'differs', 'unclear'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

const IMPORTANT_FILE_KINDS = ['core', 'risky', 'entry', 'migration', 'api', 'test'] as const;
type ImportantFileKind = (typeof IMPORTANT_FILE_KINDS)[number];

const REPORT_LEVELS = ['low', 'medium', 'high'] as const;
type ReportLevel = (typeof REPORT_LEVELS)[number];

/** Lines of a file, both ends included. */
export type ReportLines = { start: number; end: number };

/** A file the reviewer should read first, in the report's reading order. */
export type ImportantFile = {
  path: string;
  why: string;
  kind: ImportantFileKind;
  lines: ReportLines[];
  /** Keys of the requirements it serves. */
  requirements: string[];
  /** A file the change depends on without changing it. */
  unchanged: boolean;
};

/** A part of the specs, and how the change meets it. */
export type ReportRequirement = {
  key: string;
  title: string;
  /** The spec's words, quoted; null when the quote was not found in the specs sent. */
  spec: string | null;
  /** The spec it comes from (`ReportSpec.id`); null when unknown. */
  specId: number | null;
  status: RequirementStatus;
  evidence: (ReportLines & { path: string })[];
  tests: string[];
  note: string;
};

/** A change no requirement asked for. */
export type OutOfScopeChange = { path: string; hunks: string[]; reason: string; risk: ReportLevel };

type ReportRisk = { title: string; detail: string; paths: string[]; severity: ReportLevel };

/** A repository document the change should have updated. */
type ReportDoc = { path: string; note: string };

/** What the host kept of the agent's answer, and how much it dropped. */
export type ReviewReportResult = {
  verdict: ReportVerdict;
  summary: string;
  importantFiles: ImportantFile[];
  requirements: ReportRequirement[];
  outOfScope: OutOfScopeChange[];
  risks: ReportRisk[];
  questions: string[];
  docs: ReportDoc[];
  dropped: number;
};
