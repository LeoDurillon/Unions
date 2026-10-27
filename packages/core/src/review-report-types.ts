// What a spec report holds: the specs it read, its verdict, how the change works, what needs the
// reviewer, the files to read first and to skim, each requirement's status, and what the spec did not
// ask for. Pure, browser-safe.
import type { SpecSource } from './spec-source-kinds';

/**
 * A spec as the report's run sent it; `id` is the number the agent cites it by. `sameAs`: the spec
 * holding every line of this one, sent in its place.
 */
export type ReportSpec = {
  id: number;
  kind: SpecSource;
  label: string;
  text: string;
  sameAs?: number;
};

export const REPORT_VERDICTS = ['matches', 'partial', 'diverges'] as const;
export type ReportVerdict = (typeof REPORT_VERDICTS)[number];

export const REQUIREMENT_STATUSES = ['done', 'partial', 'missing', 'differs', 'unclear'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const IMPORTANT_FILE_KINDS = ['core', 'risky', 'entry', 'migration', 'api', 'test'] as const;
type ImportantFileKind = (typeof IMPORTANT_FILE_KINDS)[number];

export const REPORT_LEVELS = ['low', 'medium', 'high'] as const;
type ReportLevel = (typeof REPORT_LEVELS)[number];

export const ATTENTION_KINDS = [
  'differs',
  'missing',
  'partial',
  'unasked',
  'risk',
  'question',
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

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

/** Lines of a file the report cites. */
export type ReportCite = ReportLines & { path: string };

/** Something the reviewer must look at, in the report's order of importance. */
export type AttentionItem = {
  kind: AttentionKind;
  title: string;
  detail: string;
  /** The requirement it is about (`ReportRequirement.key`), if any. */
  requirement: string | null;
  cites: ReportCite[];
};

/** Where a step's why comes from; `inferred` when nothing the host could check says it. */
export const WHY_SOURCES = ['spec', 'commit', 'comment', 'inferred'] as const;
export type WhySource = (typeof WHY_SOURCES)[number];

/** A part of the code on the change's main path: a file, or a function of it, with its lines. */
export type FlowNode = {
  id: string;
  label: string;
  path: string;
  lines: ReportLines | null;
  /** In the change's diff. */
  changed: boolean;
};

/** One node using another: `label` says how ("fetches", "renders", "uses"). */
export type FlowEdge = { from: string; to: string; label: string };

/** One step of the walkthrough: what happens, and why, from where. */
export type FlowStep = {
  title: string;
  what: string;
  why: string;
  source: WhySource;
  /** The source's own words, checked; null when inferred. */
  quote: string | null;
  /** Ids of the nodes the step is about. */
  nodes: string[];
};

/** How the change works: a small map of its main path, and a walkthrough of it. */
export type ReportFlow = { nodes: FlowNode[]; edges: FlowEdge[]; steps: FlowStep[] };

/** A changed file the reviewer can skim, and why. */
export type SkimFile = { path: string; why: string };

/** A part of the specs, and how the change meets it. */
export type ReportRequirement = {
  key: string;
  title: string;
  /** The spec's words, quoted; null when the quote was not found in the specs sent. */
  spec: string | null;
  /** The spec it comes from (`ReportSpec.id`); null when unknown. */
  specId: number | null;
  status: RequirementStatus;
  evidence: ReportCite[];
  tests: string[];
  note: string;
};

/** A change no requirement asked for. */
export type OutOfScopeChange = { path: string; hunks: string[]; reason: string; risk: ReportLevel };

export type ReportRisk = { title: string; detail: string; paths: string[]; severity: ReportLevel };

/** A repository document the change should have updated. */
export type ReportDoc = { path: string; note: string };

/** What the host kept of the agent's answer, and how much it dropped. */
export type ReviewReportResult = {
  verdict: ReportVerdict;
  summary: string;
  flow: ReportFlow;
  attention: AttentionItem[];
  importantFiles: ImportantFile[];
  skim: SkimFile[];
  requirements: ReportRequirement[];
  outOfScope: OutOfScopeChange[];
  risks: ReportRisk[];
  questions: string[];
  docs: ReportDoc[];
  /** Changed files the agent said nothing about. */
  unreviewed: string[];
  dropped: number;
};
