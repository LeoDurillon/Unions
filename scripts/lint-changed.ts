// Lints only the TypeScript files changed since the last commit, and new ones: seconds instead of the
// whole repository while working. `bun run check` still runs everything before finishing.

/** Exported only so the file is a module (top-level await). */
export async function git(args: string[]): Promise<string[]> {
  const child = Bun.spawn(['git', ...args], { stdout: 'pipe' });
  const output = await new Response(child.stdout).text();
  return output.split('\n');
}

const listed = await Promise.all([
  git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
  git(['ls-files', '--others', '--exclude-standard']),
]);
const candidates = [...new Set(listed.flat())].filter((file) => /\.tsx?$/u.test(file));
const present = await Promise.all(candidates.map((file) => Bun.file(file).exists()));
const files = candidates.filter((_, index) => present[index]);
if (files.length === 0) {
  console.log('No changed TypeScript file.');
} else {
  const lint = Bun.spawn(['oxlint', '--type-aware', '--deny-warnings', ...files], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  process.exitCode = await lint.exited;
}
