// How a review side run says the agent's answer lacks the block it was asked for, with the answer's end.
/** How much of an unreadable answer the error keeps: its end, where the block should have been. */
const ANSWER_TAIL_CHARS = 2000;

/** The error of an answer whose `what` block could not be read, with the answer's end. */
export function missingBlock(what: string, answer: string): string {
  return `The agent's answer has no ${what} block. Its end:\n\n${answer.slice(-ANSWER_TAIL_CHARS)}`;
}
