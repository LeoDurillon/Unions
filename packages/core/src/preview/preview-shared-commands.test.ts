// Tests for the commands that keep each preview's data apart on a shared service.
import { expect, test } from 'bun:test';

import { parseSharedCommands, renderSharedCommands } from './preview-shared-commands';

const EXPOSED = [{ name: 'api', port: 3000, prefix: 'api' }];
const CREATE = 'createdb -U postgres goreno_{ticket.id}';

test('commands are kept for shared services only, trimmed, empty ones dropped', () => {
  expect(
    parseSharedCommands(
      [
        { service: 'db', create: `  ${CREATE} `, drop: 'dropdb -U postgres goreno_{ticket.id}' },
        { service: 's3', create: '', drop: ' ' },
      ],
      ['db', 's3'],
      EXPOSED,
    ),
  ).toEqual([{ service: 'db', create: CREATE, drop: 'dropdb -U postgres goreno_{ticket.id}' }]);
  expect(parseSharedCommands(undefined, ['db'], EXPOSED)).toEqual([]);
});

test('a service that is not shared, twice the same one, or an unknown template is refused', () => {
  expect(() => parseSharedCommands([{ service: 'api', create: 'x' }], ['db'], EXPOSED)).toThrow(
    '"api" is not a shared service',
  );
  expect(() =>
    parseSharedCommands(
      [
        { service: 'db', create: 'x' },
        { service: 'db', drop: 'y' },
      ],
      ['db'],
      EXPOSED,
    ),
  ).toThrow('db: its commands are given twice');
  expect(() =>
    parseSharedCommands([{ service: 'db', create: '{ticket.name}' }], ['db'], EXPOSED),
  ).toThrow("db, at a preview's start: {ticket.name} is not a template");
});

test("a preview's commands name its own data: a ticket's id, a pull request's r<id>", () => {
  const commands = [
    { service: 'db', create: CREATE },
    { service: 'mailhog', drop: 'x' },
  ];
  const context = { prNumber: null, publicPort: 8080, exposed: EXPOSED };
  expect(renderSharedCommands(commands, ['db'], { ...context, owner: { ticketId: 41 } })).toEqual([
    { service: 'db', create: 'createdb -U postgres goreno_41' },
  ]);
  expect(renderSharedCommands(commands, ['db'], { ...context, owner: { reviewId: 5 } })).toEqual([
    { service: 'db', create: 'createdb -U postgres goreno_r5' },
  ]);
});
