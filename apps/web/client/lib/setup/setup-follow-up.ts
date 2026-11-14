// The follow-ups that ask the setup agent for its whole proposal again: with answers to its questions, or a failed check.

/** The output's end the agent gets: enough to see why, not a whole install log. */
const FIX_OUTPUT_LINES = 80;

const AGAIN = `answer as the first time: a short summary, then the whole proposal in
the same final \`json\` block, every section included, not only the ones that changed.`;

/** The questions with the user's answers; a question left blank is said to be unanswered. */
export function setupFollowUp(questions: readonly string[], answers: readonly string[]): string {
  const pairs = questions.map((question, index) => {
    const answer = (answers[index] ?? '').trim();
    return `- ${question}\n  Answer: ${answer === '' ? '(not answered: decide from the files)' : answer}`;
  });
  return `Here are my answers to your questions:

${pairs.join('\n')}

Read again what these answers change, then ${AGAIN}`;
}

/** A check Union ran on the proposal failed: what it tested, the end of its output, and a new proposal asked. */
export function setupFixFollowUp(what: string, tested: string, output: string): string {
  const lines = output.trimEnd().split('\n').slice(-FIX_OUTPUT_LINES).join('\n');
  return `Union tested your proposed ${what} and it failed. What it tested:

\`\`\`
${tested}
\`\`\`

The end of the output:

\`\`\`
${lines}
\`\`\`

Read the files again to find why, then fix it and ${AGAIN}`;
}
