// A Union settings page that edits the machine settings: its intro, then its form once they are read.

import type { ComponentType, ReactElement, ReactNode } from 'react';

import type { UnionSettingsView } from '../../../src/routes/union-settings';
import { useUnionSettings } from '../../lib/union-settings/use-union-settings-form';
import { SettingsIntro } from '../settings/settings-intro';
import { Loading, SkeletonRows } from '../ui/skeleton';
import { ErrorText } from '../ui/ui';

/** `fields`: how many the form shows, for its shape while it is read. */
export function UnionSettingsLoader({
  intro,
  label,
  fields,
  form: Form,
}: {
  intro: ReactNode;
  label: string;
  fields: number;
  /** The page's form, given the saved settings. */
  form: ComponentType<{ saved: UnionSettingsView }>;
}): ReactElement {
  const settings = useUnionSettings();
  return (
    <>
      <SettingsIntro>{intro}</SettingsIntro>
      {settings.data === undefined ? (
        <section className="space-y-4">
          {settings.error ? (
            <ErrorText error={settings.error} />
          ) : (
            <Loading label={label} className="space-y-4">
              <SkeletonRows
                count={fields}
                columns="grid-cols-[10rem_6rem]"
                cells={1}
                rowClassName="h-8"
              />
            </Loading>
          )}
        </section>
      ) : (
        <Form saved={settings.data} />
      )}
    </>
  );
}
