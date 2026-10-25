// The formats Union reads back that only an agent's editable prompt asks for, and which of them a prompt dropped.
// Browser-safe: the agent page warns with it while the user edits a prompt.

type PromptFormat = {
  /** Every pattern must be in the prompt for it to still ask for the format. */
  needs: readonly RegExp[];
  /** What the user loses without it. */
  missing: string;
};

const PROMPT_FORMATS: Readonly<Record<string, PromptFormat>> = {
  intake: {
    needs: [/Answer:/u],
    missing:
      'It no longer asks for an "Answer:" line under each question: you will have no box to answer the questions in.',
  },
  final_review: {
    // The client reads the verdict line in any case (`verdict.ts`).
    needs: [/VERDICT:/iu, /\bAPPROVED\b/iu, /\bCHANGES_REQUESTED\b/iu],
    missing:
      'It no longer asks for a first line "VERDICT: APPROVED" or "VERDICT: CHANGES_REQUESTED": the ticket will show no verdict.',
  },
  split_plan: {
    needs: [/## Slice \S+:/u, /\*\*Spec:\*\*/u],
    missing:
      'It no longer asks for "## Slice <n>: <title>" sections with a "**Spec:**" paragraph: Union cannot read the plan, and the step fails.',
  },
  split: {
    needs: [/\bSlice: /u],
    missing:
      'It no longer asks for a "Slice: <n>" line at the end of each commit message: Union cannot place the commits in their slices.',
  },
};

/** What the prompt no longer asks for that Union reads from the agent's answer; empty when nothing is lost. */
export function missingFormats(agent: string, prompt: string): string[] {
  const format = PROMPT_FORMATS[agent];
  if (format === undefined || format.needs.every((pattern) => pattern.test(prompt))) {
    return [];
  }
  return [format.missing];
}
