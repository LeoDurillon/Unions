const LINE = /^(?<key>[^=]+)=(?<value>.*)$/u;

/** `KEY=value` lines (blank lines and `#` comments skipped) to variables. */
export function parseEnvLines(text: string): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.startsWith('#') ? null : LINE.exec(trimmed);
    if (match?.groups?.key) {
      variables[match.groups.key.trim()] = match.groups.value ?? '';
    }
  }
  return variables;
}

export function envLines(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}
