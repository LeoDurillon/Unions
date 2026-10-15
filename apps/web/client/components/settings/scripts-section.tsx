import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectScript } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Button, ErrorText } from '../ui';
import { draftOf, ScriptCard, ScriptForm, scriptOf, type ScriptDraft } from './script-row';

const EMPTY: ScriptDraft = { name: '', command: '', minutes: '' };

/** The script open in the form: a saved one by its place in the list, or a new one (null). */
type Editing = { index: number | null; draft: ScriptDraft };

/** The list as saved, with the open script put in its place (or added), or taken out. */
function listWith(
  scripts: readonly ProjectScript[],
  editing: Editing,
  remove: boolean,
): ProjectScript[] {
  if (editing.index === null) {
    return [...scripts, scriptOf(editing.draft)];
  }
  return scripts.flatMap((script, at) => {
    if (at !== editing.index) {
      return [script];
    }
    return remove ? [] : [scriptOf(editing.draft)];
  });
}

/** The saved scripts, the one open in the form, and saving the list (which closes the form). */
function useScriptEditing(project: PublicProject): {
  scripts: ProjectScript[];
  editing: Editing | null;
  open: (next: Editing | null) => void;
  form: (current: Editing) => ReactElement;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const scripts = project.config.scripts ?? [];
  const [editing, setEditing] = useState<Editing | null>(null);
  const save = useMutation({
    mutationFn: (next: ProjectScript[]) => api.updateProject(project.id, { scripts: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditing(null);
    },
  });
  const open = (next: Editing | null): void => {
    setEditing(next);
    save.reset();
  };
  const form = (current: Editing): ReactElement => (
    <ScriptForm
      key={current.index ?? 'new'}
      draft={current.draft}
      pending={save.isPending}
      onChange={(draft) => {
        setEditing({ ...current, draft });
      }}
      onSave={() => {
        save.mutate(listWith(scripts, current, false));
      }}
      onCancel={() => {
        open(null);
      }}
      onRemove={
        current.index === null
          ? undefined
          : () => {
              save.mutate(listWith(scripts, current, true));
            }
      }
    />
  );
  return { scripts, editing, open, form, error: save.error };
}

/** Commands saved by name, run from a ticket's Preview tab in its workspace; one edited at a time. */
export function ScriptsSection({ project }: { project: PublicProject }): ReactElement {
  const { scripts, editing, open, form, error } = useScriptEditing(project);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Scripts</h3>
      <p className="text-xs text-zinc-500">
        Commands you run by name from a ticket&apos;s Preview tab, in its workspace: the repository,
        as the agent (no GitHub credentials), with <code>PREVIEW_URL</code> while the preview runs.
        Their output can go to the agent. The timeout is 10 minutes unless set (30 at most).
      </p>
      <ul className="space-y-2">
        {scripts.map((script, index) =>
          editing?.index === index ? (
            form(editing)
          ) : (
            <ScriptCard
              key={script.name}
              script={script}
              disabled={editing !== null}
              onEdit={() => {
                open({ index, draft: draftOf(script) });
              }}
            />
          ),
        )}
        {editing?.index === null ? form(editing) : null}
      </ul>
      <ErrorText error={error} />
      {editing === null ? (
        <Button
          onClick={() => {
            open({ index: null, draft: EMPTY });
          }}
        >
          Add a script
        </Button>
      ) : null}
    </section>
  );
}
