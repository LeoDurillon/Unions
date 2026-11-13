// Project settings → Review: the files the review page lists apart, and when Review with agent works in slices.

import { DEFAULT_SLICE_REVIEW_ABOVE } from '@union/core/agent-review-slices';
import { LOCK_FILES } from '@union/core/diff';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { useSettingsForm } from '../../lib/settings/use-settings-form';
import { Switch } from '../ui/choice';
import { Field, inputClass } from '../ui/ui';
import { SaveBar } from './save-bar';
import { SettingsIntro } from './settings-intro';

function LockFilesToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}): ReactElement {
  return (
    <Switch checked={checked} onChange={onChange} hint={LOCK_FILES.join(', ')}>
      <span className="font-medium">Ignore lock files</span>
    </Switch>
  );
}

function SliceField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field
      label="Review with agent in slices above"
      hint="Changed lines, ignored files left out. Above it, Review with agent offers to cut the change into parts, one agent each, then one more on how they fit. Empty: the default; 0: never."
    >
      <input
        className={`${inputClass} max-w-32`}
        type="number"
        min={0}
        value={value}
        placeholder={String(DEFAULT_SLICE_REVIEW_ABOVE)}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

/** Files the review page lists apart (collapsed), and when Review with agent works in slices. */
export function ReviewSection({ project }: { project: PublicProject }): ReactElement {
  const { sliceReviewAbove } = project.config;
  const form = useSettingsForm(
    () => ({
      hideLockFiles: project.config.hideLockFiles !== false,
      patterns: (project.config.reviewIgnore ?? []).join('\n'),
      sliceAbove: sliceReviewAbove === undefined ? '' : String(sliceReviewAbove),
    }),
    ({ hideLockFiles, patterns, sliceAbove }) =>
      api.updateProject(project.id, {
        hideLockFiles,
        reviewIgnore: patterns.split('\n').filter((line) => line.trim() !== ''),
        sliceReviewAbove: sliceAbove.trim() === '' ? null : Number(sliceAbove),
      }),
  );

  return (
    <>
      <SettingsIntro>
        Ignored files are listed apart and collapsed on the review page; you can still open them.
      </SettingsIntro>
      <section className="space-y-4">
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
        <SliceField
          value={form.value.sliceAbove}
          onChange={(sliceAbove) => {
            form.set({ ...form.value, sliceAbove });
          }}
        />
        <SaveBar state={form} />
      </section>
    </>
  );
}
