// Reads the explanation block at the end of the agent's answer, and drops the citations it cannot back.
import type { AgentReviewSpec, ExplainedDoc, ExplainedSpec, ExplanationResult } from '@union/core';

import { isRecord, lastJsonBlock } from './json-block';

const MAX_EXPLANATION = 12_000;
const MAX_TEXT = 2000;
const MAX_CITATIONS = 20;

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, MAX_CITATIONS).filter((item) => isRecord(item)) : [];
}

/** The last JSON block holding an `explanation`; null when there is none. */
function lastBlock(answer: string): Record<string, unknown> | null {
  return lastJsonBlock(answer, (block) => typeof block.explanation === 'string');
}

function squeezed(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim().toLowerCase();
}

/** A spec citation stands when it names a spec that was sent and quotes words found in it. */
function specOf(item: Record<string, unknown>, specs: AgentReviewSpec[]): ExplainedSpec | null {
  const source = text(item.source);
  const quote = text(item.quote);
  const spec = specs.find((candidate) => candidate.label === source);
  if (!spec || quote === '' || !squeezed(spec.text).includes(squeezed(quote))) {
    return null;
  }
  return { source, quote, how: text(item.how) };
}

/** A path inside the checkout: relative, without `..`. */
function docOf(item: Record<string, unknown>): ExplainedDoc | null {
  const path = text(item.path).replace(/^\.\//u, '');
  if (path === '' || path.startsWith('/') || path.split('/').includes('..')) {
    return null;
  }
  return { path, heading: text(item.heading), why: text(item.why) };
}

/**
 * The agent's explanation with the spec citations checked against the specs sent; its docs are only
 * checked for shape here (`keepDocs` drops the ones not in the checkout). Null without a block.
 */
export function parseExplanation(
  answer: string,
  specs: AgentReviewSpec[],
): ExplanationResult | null {
  const block = lastBlock(answer);
  if (!block) {
    return null;
  }
  const rawSpecs = list(block.specs);
  const rawDocs = list(block.docs);
  const kept = rawSpecs.flatMap((item) => specOf(item, specs) ?? []);
  const docs = rawDocs.flatMap((item) => docOf(item) ?? []);
  const notInSpec = text(block.notInSpec);
  return {
    explanation: text(block.explanation, MAX_EXPLANATION),
    specs: kept,
    docs,
    notInSpec: notInSpec === '' ? null : notInSpec,
    dropped: rawSpecs.length - kept.length + rawDocs.length - docs.length,
  };
}

/** Keeps the docs whose path is in `existing`, counting the others as dropped. */
export function keepDocs(
  result: ExplanationResult,
  existing: ReadonlySet<string>,
): ExplanationResult {
  const docs = result.docs.filter((doc) => existing.has(doc.path));
  return { ...result, docs, dropped: result.dropped + result.docs.length - docs.length };
}
