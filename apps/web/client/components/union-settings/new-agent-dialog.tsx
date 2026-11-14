// Creates a custom agent from its kind, a name and a role; the worker then writes its prompt, and its page opens.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CustomAgentKind } from '@union/core';
import { useEffect, useState, type ReactElement } from 'react';

import { customAgentsApi } from '../../lib/union-settings/custom-agents-api';
import { openUnionSettings } from '../../lib/union-settings/union-settings-sections';
import { Dialog } from '../ui/dialog';
import { Button, ErrorText, Field, inputClass, TextInput } from '../ui/ui';
import { AgentKindField, KIND_TEXTS } from './agent-kind-field';

const ROLE_ROWS = 5;

/** Tells `onDirty` whether something is typed, each time that changes. */
function useTyped(typed: boolean, onDirty: (dirty: boolean) => void): void {
  useEffect(() => {
    onDirty(typed);
  }, [typed, onDirty]);
}

function NewAgentForm({
  onClose,
  onDirty,
  initialKind,
}: {
  onClose: () => void;
  /** Whether a name or a role is typed, which closing would lose. */
  onDirty: (dirty: boolean) => void;
  initialKind: CustomAgentKind;
}): ReactElement {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [kind, setKind] = useState<CustomAgentKind>(initialKind);
  useTyped(name.trim() !== '' || role.trim() !== '', onDirty);
  const create = useMutation({
    mutationFn: () => customAgentsApi.create({ name, role, kind }),
    onSuccess: async (config) => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      onClose();
      openUnionSettings(config.agent);
    },
  });
  return (
    <div className="space-y-4">
      <AgentKindField value={kind} onChange={setKind} />
      <p className="text-sm text-zinc-500">{KIND_TEXTS[kind].intro}</p>
      <Field label="Name">
        <TextInput
          value={name}
          onChange={setName}
          placeholder={kind === 'review' ? 'Merge readiness' : 'Security pass'}
        />
      </Field>
      <Field label="Role" hint="What it checks or writes, and what it should leave out.">
        <textarea
          className={inputClass}
          rows={ROLE_ROWS}
          value={role}
          placeholder={KIND_TEXTS[kind].placeholder}
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

/** A "New agent" button with its dialog; `kind` is the kind it starts on. */
export function NewAgentButton({
  className = '',
  kind = 'step',
  label = 'New agent',
}: {
  className?: string;
  kind?: CustomAgentKind;
  label?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const close = (): void => {
    setOpen(false);
    setDirty(false);
  };
  return (
    <>
      <Button
        className={className}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog open={open} onClose={close} title="New agent" dirty={dirty}>
        {open ? <NewAgentForm onClose={close} onDirty={setDirty} initialKind={kind} /> : null}
      </Dialog>
    </>
  );
}
