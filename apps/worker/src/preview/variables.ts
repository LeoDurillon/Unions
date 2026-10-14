import type { Target } from './target';

/** The project's variables as they go into a compose file, and as the env file's content. */
export type Written = { env: Record<string, string>; content: string };

/**
 * Compose reads `$` as the start of `${VAR}` in the file it is given: a value Union writes into it
 * keeps its `$` as `$$` (what `docker compose config` prints for a literal `$` too).
 */
export function escapeDollars(value: string): string {
  return value.replaceAll('$', () => '$$');
}

function secretReference(name: string): string {
  return `\${${name}}`;
}

function content(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
}

/** For the file Docker runs: every value, secrets included, escaped. */
export function runVariables(target: Target): Written {
  const env = Object.fromEntries(
    Object.entries({ ...target.plain, ...target.secrets }).map(([key, value]) => [
      key,
      escapeDollars(value),
    ]),
  );
  return { env, content: content(env) };
}

/**
 * For the file people read (and may save as their own): each secret is `${NAME}`, which compose
 * fills in from the worker's environment when that file runs; its value never reaches the browser.
 */
export function shownVariables(target: Target): Written {
  const env = {
    ...Object.fromEntries(
      Object.entries(target.plain).map(([key, value]) => [key, escapeDollars(value)]),
    ),
    ...Object.fromEntries(Object.keys(target.secrets).map((name) => [name, secretReference(name)])),
  };
  return { env, content: content(env) };
}

/**
 * The environment `docker compose config` interpolates the repository's `${VAR}` with. Shown: each
 * secret is its own `${NAME}`, which compose prints escaped (`$${NAME}`): `unmaskSecrets` turns it
 * back into a reference.
 */
export function configEnvironment(target: Target, shown: boolean): Record<string, string> {
  const secrets = shown
    ? Object.fromEntries(Object.keys(target.secrets).map((name) => [name, secretReference(name)]))
    : target.secrets;
  return { ...target.plain, ...secrets };
}

/** In the file people read, the escaped `$${NAME}` of each secret becomes the reference `${NAME}`. */
export function unmaskSecrets(yaml: string, names: string[]): string {
  return names.reduce(
    (text, name) => text.replaceAll(`$${secretReference(name)}`, () => secretReference(name)),
    yaml,
  );
}
