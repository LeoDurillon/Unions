// The reviewer's verdict line (`VERDICT: APPROVED` / `VERDICT: CHANGES_REQUESTED`), if any.
export type Verdict = 'approved' | 'changes_requested';

const VERDICT_LINE = /^\s*\**\s*VERDICT:\s*\**\s*(?<verdict>APPROVED|CHANGES_REQUESTED)\b.*$/imu;

/** The reviewer's verdict line (`VERDICT: APPROVED` / `VERDICT: CHANGES_REQUESTED`), if any. */
export function parseVerdict(review: string): Verdict | null {
  const verdict = VERDICT_LINE.exec(review)?.groups?.verdict?.toUpperCase();
  if (verdict === 'APPROVED') {
    return 'approved';
  }
  return verdict === 'CHANGES_REQUESTED' ? 'changes_requested' : null;
}

/** The review without its verdict line: what the implementer should act on. */
export function findingsOf(review: string): string {
  return review.replace(VERDICT_LINE, '').trim();
}
