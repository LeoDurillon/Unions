// Queues a "Suggest improvements" investigation: the project's usage findings over a range, asked of an agent reading the repository.
import type { Db } from './db';
import { INVESTIGATION_DEFAULTS } from './investigation-defaults';
import { createInvestigation, InvestigationError, type Investigation } from './investigations';
import { projectFindings } from './project-findings';
import { projectUsage } from './project-usage';
import { suggestionPrompt } from './usage-suggestion-prompt';

/** Reading the repository is all it needs: no web search, no shell. */
const TOOLS = ['Read', 'Grep', 'Glob'];

function rangeText(days: number | null): string {
  return days === null ? 'all time' : `the last ${days} days`;
}

/**
 * Queues a repository investigation on the project's findings over the last `days` days (null:
 * all), with the default model, reading the repository only. Refused when nothing stands out.
 */
export function suggestImprovements(
  db: Db,
  projectId: number,
  days: number | null,
  now = Date.now(),
): Investigation {
  const findings = projectFindings(db, projectId, days, now);
  if (findings.findings.length === 0) {
    throw new InvestigationError('Nothing stands out in this range: there is nothing to ask about');
  }
  const { title, prompt } = suggestionPrompt(
    findings,
    projectUsage(db, projectId, days, now),
    rangeText(days),
  );
  return createInvestigation(db, {
    projectId,
    title,
    prompt,
    scope: 'repository',
    model: INVESTIGATION_DEFAULTS.model,
    tools: TOOLS,
  });
}
