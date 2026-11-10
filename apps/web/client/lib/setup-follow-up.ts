// The follow-up that answers the setup agent's questions and asks it for its whole proposal again.

/** The questions with the user's answers; a question left blank is said to be unanswered. */
export function setupFollowUp(questions: readonly string[], answers: readonly string[]): string {
  const pairs = questions.map((question, index) => {
    const answer = (answers[index] ?? '').trim();
    return `- ${question}\n  Answer: ${answer === '' ? '(not answered: decide from the files)' : answer}`;
  });
  return `Here are my answers to your questions:

${pairs.join('\n')}

Read again what these answers change, then answer as the first time: a short summary, then the whole proposal in
the same final \`json\` block, every section included, not only the ones that changed.`;
}
