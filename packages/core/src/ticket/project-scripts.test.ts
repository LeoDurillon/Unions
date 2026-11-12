import { expect, test } from 'bun:test';

import { ContainerRunError } from './container-runs';
import { parseScripts, ScriptsError, scriptRun } from './project-scripts';

test('scripts are trimmed; a missing name or command, or an empty one, is refused', () => {
  expect(parseScripts([{ name: ' a ', command: ' ls ', timeoutSec: null }])).toEqual([
    { name: 'a', command: 'ls' },
  ]);
  expect(() => parseScripts([{ name: 'a' }])).toThrow(ScriptsError);
  expect(() => parseScripts([{ name: ' ', command: 'ls' }])).toThrow(ScriptsError);
  expect(() => parseScripts([{ name: 'a', command: 'ls', timeoutSec: 1.5 }])).toThrow(ScriptsError);
  expect(() => parseScripts([null])).toThrow(ScriptsError);
});

test('a run of a saved script takes its command and timeout; an unknown name is refused', () => {
  const config = {
    baseBranch: 'main',
    scripts: [{ name: 'Import', command: 'npm run import', timeoutSec: 60 }],
  };
  expect(scriptRun(config, 'Import')).toEqual({
    command: 'npm run import',
    timeoutSec: 60,
    scriptName: 'Import',
  });
  expect(() => scriptRun(config, 'import')).toThrow(ContainerRunError);
});
