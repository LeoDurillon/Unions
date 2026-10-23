// Commands saved by name, run from a ticket's Preview tab in its workspace; one edited at a time.
import type { ProjectScript } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useLeaveGuard } from '../../lib/leave-guard';
import { useSettingsForm, type SettingsForm } from '../../lib/use-settings-form';
import { Button } from '../ui';
import { SaveBar } from './save-bar';
import { draftOf, ScriptCard, ScriptForm, scriptOf, type ScriptDraft } from './script-row';

const EMPTY: ScriptDraft = { name: '', command: '', minutes: '' };

/** The script open in the form: one of the list by its place, or a new one (null). */
type Editing = { index: number | null; draft: ScriptDraft };

/** The list with the open script put in its place (or added), or taken out. */
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

/** Whether the open script differs from what it started as. */
function changed(editing: Editing | null, scripts: readonly ProjectScript[]): boolean {
  if (editing === null) {
    return false;
  }
  const original = scripts[editing.index ?? -1];
  const start = original ? draftOf(original) : EMPTY;
  return JSON.stringify(editing.draft) !== JSON.stringify(start);
}

/** The script open in the form; Done and Remove change the page's list, its Save writes it. */
function useScriptEditing(form: SettingsForm<ProjectScript[]>): {
  editing: Editing | null;
  open: (next: Editing | null) => void;
  editor: (current: Editing) => ReactElement;
} {
  const [editing, setEditing] = useState<Editing | null>(null);
  useLeaveGuard(changed(editing, form.value));
  const apply = (current: Editing, remove: boolean): void => {
    form.set(listWith(form.value, current, remove));
    setEditing(null);
  };
  const editor = (current: Editing): ReactElement => (
    <ScriptForm
      key={current.index ?? 'new'}
      draft={current.draft}
      onChange={(draft) => {
        setEditing({ ...current, draft });
      }}
      onDone={() => {
        apply(current, false);
      }}
      onCancel={() => {
        setEditing(null);
      }}
      onRemove={
        current.index === null
          ? undefined
          : () => {
              apply(current, true);
            }
      }
    />
  );
  return { editing, open: setEditing, editor };
}

/** Commands saved by name, run from a ticket's Preview tab in its workspace; one edited at a time. */
export function ScriptsSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => project.config.scripts ?? [],
    (scripts) => api.updateProject(project.id, { scripts }),
  );
  const { editing, open, editor } = useScriptEditing(form);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Scripts</h3>
      <p className="text-xs text-zinc-500">
        Commands you run by name from a ticket&apos;s Preview tab, in its workspace: the repository,
        as the agent (no GitHub credentials), with <code>PREVIEW_URL</code> while the preview runs.
        Their output can go to the agent. The timeout is 10 minutes unless set (30 at most).
      </p>
      <ul className="space-y-2">
        {form.value.map((script, index) =>
          editing?.index === index ? (
            editor(editing)
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
        {editing?.index === null ? editor(editing) : null}
      </ul>
      {editing === null ? (
        <Button
          onClick={() => {
            open({ index: null, draft: EMPTY });
          }}
        >
          Add a script
        </Button>
      ) : null}
      <SaveBar
        state={form}
        invalid={editing === null ? null : 'Finish or cancel the script you are editing.'}
      />
    </section>
  );
}
