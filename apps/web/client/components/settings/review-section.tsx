import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LOCK_FILES } from '@union/core/diff';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Button, ErrorText, Field, inputClass } from '../ui';

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
  const queryClient = useQueryClient();
  const savedHide = project.config.hideLockFiles !== false;
  const savedPatterns = (project.config.reviewIgnore ?? []).join('\n');
  const [hideLockFiles, setHideLockFiles] = useState(savedHide);
  const [patterns, setPatterns] = useState(savedPatterns);
  const save = useMutation({
    mutationFn: () =>
      api.updateProject(project.id, {
        hideLockFiles,
        reviewIgnore: patterns.split('\n').filter((line) => line.trim() !== ''),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  const dirty = hideLockFiles !== savedHide || patterns.trim() !== savedPatterns.trim();

  return (
    <section className="space-y-4">
      <p className="text-xs text-zinc-500">
        Ignored files are listed apart and collapsed on the review page; you can still open them.
      </p>
      <LockFilesToggle checked={hideLockFiles} onChange={setHideLockFiles} />
      <Field
        label="Ignored paths"
        hint="One gitignore-style pattern per line: dist/, *.snap, /generated/**. Lines starting with # are comments."
      >
        <textarea
          className={`${inputClass} min-h-28 font-mono`}
          value={patterns}
          placeholder={'dist/\n*.snap'}
          onChange={(event) => {
            setPatterns(event.target.value);
            save.reset();
          }}
        />
      </Field>
      <ErrorText error={save.error} />
      <Button
        disabled={!dirty || save.isPending}
        onClick={() => {
          save.mutate();
        }}
      >
        Save
      </Button>
      {save.isSuccess ? <p className="text-sm text-green-700 dark:text-green-400">Saved.</p> : null}
    </section>
  );
}
