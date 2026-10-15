import { LOCK_FILES } from '@union/core/diff';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { useSettingsForm } from '../../lib/use-settings-form';
import { Field, inputClass } from '../ui';
import { SaveBar } from './save-bar';

function LockFilesToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}): ReactElement {
  return (
    <div className="flex items-start gap-3">
      <input
        id="hide-lock-files"
        type="checkbox"
        className="mt-1 size-4 accent-indigo-600"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <div>
        <label htmlFor="hide-lock-files" className="block text-sm font-medium">
          Ignore lock files
        </label>
        <p className="text-xs text-zinc-500">{LOCK_FILES.join(', ')}</p>
      </div>
    </div>
  );
}

/** Files the review page lists apart (collapsed), so the sidebar shows what needs reading. */
export function ReviewSection({ project }: { project: PublicProject }): ReactElement {
  const form = useSettingsForm(
    () => ({
      hideLockFiles: project.config.hideLockFiles !== false,
      patterns: (project.config.reviewIgnore ?? []).join('\n'),
    }),
    ({ hideLockFiles, patterns }) =>
      api.updateProject(project.id, {
        hideLockFiles,
        reviewIgnore: patterns.split('\n').filter((line) => line.trim() !== ''),
      }),
  );

  return (
    <section className="space-y-4">
      <p className="text-xs text-zinc-500">
        Ignored files are listed apart and collapsed on the review page; you can still open them.
      </p>
      <LockFilesToggle
        checked={form.value.hideLockFiles}
        onChange={(hideLockFiles) => {
          form.set({ ...form.value, hideLockFiles });
        }}
      />
      <Field
        label="Ignored paths"
        hint="One gitignore-style pattern per line: dist/, *.snap, /generated/**. Lines starting with # are comments."
      >
        <textarea
          className={`${inputClass} min-h-28 font-mono`}
          value={form.value.patterns}
          placeholder={'dist/\n*.snap'}
          onChange={(event) => {
            form.set({ ...form.value, patterns: event.target.value });
          }}
        />
      </Field>
      <SaveBar state={form} />
    </section>
  );
}
