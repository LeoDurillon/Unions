// The settings menu narrowed by a few words: the pages whose name, or whose group's name, holds every word typed.

type Group<S extends string> = {
  label: string | null;
  sections: readonly { id: S; label: string }[];
};

/** The groups with only the pages that match, in their order; groups left empty are dropped. */
export function filterNav<S extends string, G extends Group<S>>(
  groups: readonly G[],
  query: string,
): G[] {
  const words = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');
  if (words.length === 0) {
    return [...groups];
  }
  return groups
    .map((group) => ({
      ...group,
      sections: group.sections.filter((entry) => {
        const text = `${group.label ?? ''} ${entry.label}`.toLowerCase();
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((group) => group.sections.length > 0);
}
