// What a project shows on the folded sidebar: the initials of its repository's name ("union-next" → "UN").

/** The first letters of the name's first two words (split on -, _, ., spaces and camelCase), else its first two letters. */
export function repoInitials(repo: string): string {
  const words = repo
    .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, '$<lower> $<upper>')
    .split(/[-_.\s]+/u)
    .filter((word) => word !== '');
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }
  const only = words[0] ?? repo;
  return `${only.charAt(0).toUpperCase()}${only.charAt(1)}`;
}
