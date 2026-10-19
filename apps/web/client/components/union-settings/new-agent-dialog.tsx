// Creates a custom agent from a name and a role; the worker then writes its prompt, and its page opens.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { customAgentsApi } from '../../lib/custom-agents-api';
import { openUnionSettings } from '../../lib/union-settings-sections';
import { Button, Dialog, ErrorText, Field, inputClass, TextInput } from '../ui';

const ROLE_ROWS = 5;

function NewAgentForm({ onClose }: { onClose: () => void }): ReactElement {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const create = useMutation({
    mutationFn: () => customAgentsApi.create({ name, role }),
    onSuccess: async (config) => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      onClose();
      openUnionSettings(config.agent);
    },
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Say what the agent should do. Union writes its prompt from this, in the style of the
        built-in agents; you review it on its page, then add the agent to a project&apos;s flows.
      </p>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="Security pass" />
      </Field>
      <Field label="Role" hint="What it checks or writes, and what it should leave out.">
        <textarea
          className={inputClass}
          rows={ROLE_ROWS}
          value={role}
          placeholder="Check the plan for security risks: auth, input validation, secrets, data exposure."
          onChange={(event) => {
            setRole(event.target.value);
          }}
        />
      </Field>
      <ErrorText error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={name.trim() === '' || role.trim() === '' || create.isPending}
          onClick={() => {
            create.mutate();
          }}
        >
          Create and write its prompt
        </Button>
      </div>
    </div>
  );
}

/** A "New agent" button with its dialog. */
export function NewAgentButton({ className = '' }: { className?: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const close = (): void => {
    setOpen(false);
  };
  return (
    <>
      <Button
        className={className}
        onClick={() => {
          setOpen(true);
        }}
      >
        New agent
      </Button>
      <Dialog open={open} onClose={close} title="New agent">
        {open ? <NewAgentForm onClose={close} /> : null}
      </Dialog>
    </>
  );
}
