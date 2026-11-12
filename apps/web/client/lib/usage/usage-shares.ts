// What the Usage tab shows about a split of the cost: each row's share of the costliest, and the model most calls
// ran on.

type Costed = { costUsd: number };
type ModelRow = { model: string; calls: number };

const PERCENT = 100;

/** A row's bar, in percent of the costliest row (the costliest fills it); at least 1 when it cost anything. */
export function shareOf(row: Costed, rows: readonly Costed[]): number {
  const most = Math.max(0, ...rows.map((entry) => entry.costUsd));
  if (most === 0 || row.costUsd <= 0) {
    return 0;
  }
  return Math.max(1, Math.round((row.costUsd / most) * PERCENT));
}

/** A model's family as people say it: `claude-opus-5-5` → `Opus`; another name stays as it is. */
export function modelFamily(model: string): string {
  const family = /^claude-(?<name>[a-z]+)/u.exec(model)?.groups?.name;
  return family ? family.charAt(0).toUpperCase() + family.slice(1) : model;
}

/** "603 on Opus": the family most calls ran on and how many; null without calls. */
export function topModel(models: readonly ModelRow[]): string | null {
  const byFamily = new Map<string, number>();
  for (const { model, calls } of models) {
    const family = modelFamily(model);
    byFamily.set(family, (byFamily.get(family) ?? 0) + calls);
  }
  const [top] = [...byFamily].toSorted((a, b) => b[1] - a[1]);
  return top && top[1] > 0 ? `${top[1]} on ${top[0]}` : null;
}
