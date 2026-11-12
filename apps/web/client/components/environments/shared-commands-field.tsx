// The services shared between previews and, per service, the commands that keep each preview's data
// apart there. That data is its database, its bucket; per service also the port of its web page,
// which the proxy opens.

import type { ReactElement } from 'react';

import { PreviewChoicesField } from './preview-choices-field';
import { TextField } from './preview-fields';
import type { Form, SharedCommands } from './preview-form';

const CREATE_HINT =
  "Runs in the service's container before each start of a preview, and before the agent uses it. Make it safe to run again, for example create the database only if it is missing. {ticket.id} names the preview.";
const PORT_HINT =
  'Optional. The port of its web page (a console, an inbox), opened at <service>-p<project>.union.localhost on this machine, one address for all the previews. Takes effect the next time the shared services start.';
const DIGITS = /^\d+$/u;
const DROP_HINT =
  "Runs when the preview's data is removed: Stop, Reset, a start that failed, and once the ticket is done or removed.";

function commandsFor(all: SharedCommands[], service: string): SharedCommands {
  return all.find((commands) => commands.service === service) ?? { service };
}

/** Each shared service's commands (empty when its data needs no keeping apart, a mail catcher) and port. */
function SharedCommandsField({
  services,
  value,
  onChange,
}: {
  services: string[];
  value: SharedCommands[];
  onChange: (value: SharedCommands[]) => void;
}): ReactElement | null {
  if (services.length === 0) {
    return null;
  }
  const change = (next: SharedCommands): void => {
    onChange([...value.filter(({ service }) => service !== next.service), next]);
  };
  return (
    <div className="space-y-3">
      {services.map((service) => {
        const commands = commandsFor(value, service);
        return (
          <div
            key={service}
            className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <TextField
              label={`${service}: when a preview starts`}
              hint={CREATE_HINT}
              value={commands.create ?? ''}
              placeholder="createdb -U postgres app_{ticket.id}"
              onChange={(create) => {
                change({ ...commands, create });
              }}
            />
            <TextField
              label={`${service}: when a preview's data is removed`}
              hint={DROP_HINT}
              value={commands.drop ?? ''}
              placeholder="dropdb -U postgres --if-exists app_{ticket.id}"
              onChange={(drop) => {
                change({ ...commands, drop });
              }}
            />
            <TextField
              label={`${service}: port to open in the browser`}
              hint={PORT_HINT}
              value={commands.port === undefined ? '' : String(commands.port)}
              placeholder="9001"
              onChange={(port) => {
                const { port: _port, ...rest } = commands;
                change(DIGITS.test(port.trim()) ? { ...rest, port: Number(port) } : rest);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

const SHARED_HINT =
  "Services that Union runs once for all the project's previews instead of in each one, to save memory (a virus scanner, a mail catcher, a database). Each preview still reaches them by their name. For a service with data, give each preview its own below. A pull request from a fork runs its own copies.";

/** The services shared between the project's previews, and what keeps each preview's data apart there. */
export function SharedServicesFields({
  form,
  known,
  onChange,
}: {
  form: Form;
  known: string[];
  onChange: (form: Form) => void;
}): ReactElement {
  return (
    <>
      <PreviewChoicesField
        label="Shared between previews"
        hint={SHARED_HINT}
        example="clamav, mailhog"
        selected={form.sharedServices}
        known={known}
        onChange={(sharedServices) => {
          onChange({ ...form, sharedServices });
        }}
      />
      <SharedCommandsField
        services={form.sharedServices}
        value={form.sharedCommands}
        onChange={(sharedCommands) => {
          onChange({ ...form, sharedCommands });
        }}
      />
    </>
  );
}
