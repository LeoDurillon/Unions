// Union settings → System: how often GitHub is read, the largest project file, and the images Union runs.

import { COUNT_BOUNDS, DEFAULT_IMAGES } from '@union/core/union-settings-fields';
import type { ReactElement } from 'react';

import type { UnionSettingsView } from '../../../src/routes/union-settings';
import type { SettingsForm } from '../../lib/settings/use-settings-form';
import { useUnionSettingsForm } from '../../lib/union-settings/use-union-settings-form';
import { SaveBar } from '../settings/save-bar';
import { ImageField, NumberField } from './union-settings-fields';
import { UnionSettingsLoader } from './union-settings-loader';

/** The fields the form shows, for its shape while it is read. */
const FIELDS = 5;

type FormProps = { form: SettingsForm<UnionSettingsView> };

function LimitFields({ form }: FormProps): ReactElement {
  return (
    <>
      <NumberField
        unit="seconds"
        bounds={COUNT_BOUNDS.githubPullSeconds}
        label="Read GitHub every"
        hint="How often Union reads what changed on GitHub: pull requests, reviews, comments, the GitHub Project. Lower is fresher, and uses more of GitHub's rate limit."
        value={form.value.githubPullSeconds}
        onChange={(githubPullSeconds) => {
          form.set({ ...form.value, githubPullSeconds });
        }}
      />
      <NumberField
        unit="MB"
        bounds={COUNT_BOUNDS.maxProjectFileMb}
        label="Largest project file"
        hint="The biggest file you can give a project (a database dump, a fixture), in project settings → Files."
        value={form.value.maxProjectFileMb}
        onChange={(maxProjectFileMb) => {
          form.set({ ...form.value, maxProjectFileMb });
        }}
      />
    </>
  );
}

function ImageFields({ form }: FormProps): ReactElement {
  return (
    <>
      <ImageField
        label="Agent image"
        hint="The image agents run in, and what FROM union-agent means in a project's Dockerfile. Empty: the image Union builds."
        placeholder={DEFAULT_IMAGES.agentImage}
        value={form.value.agentImage}
        onChange={(agentImage) => {
          form.set({ ...form.value, agentImage });
        }}
      />
      <ImageField
        label="Minimal agent image"
        hint="What FROM union-agent-base means in a project's Dockerfile: git and Claude Code only. Empty: the image Union builds."
        placeholder={DEFAULT_IMAGES.agentBaseImage}
        value={form.value.agentBaseImage}
        onChange={(agentBaseImage) => {
          form.set({ ...form.value, agentBaseImage });
        }}
      />
      <ImageField
        label="Preview helper image"
        hint="The Docker CLI image that runs docker compose for previews. It holds the Docker socket: name an image you trust, pinned by digest. Empty: the one Union pins."
        placeholder={DEFAULT_IMAGES.composeImage}
        value={form.value.composeImage}
        onChange={(composeImage) => {
          form.set({ ...form.value, composeImage });
        }}
      />
    </>
  );
}

function SystemForm({ saved }: { saved: UnionSettingsView }): ReactElement {
  const form = useUnionSettingsForm(saved);
  return (
    <section className="space-y-4">
      <LimitFields form={form} />
      <ImageFields form={form} />
      <SaveBar state={form} />
    </section>
  );
}

/** The page: the saved values, then the form. */
export function SystemPage(): ReactElement {
  return (
    <UnionSettingsLoader
      intro="How often Union reads GitHub, the largest file a project can hold, and the images its containers start from. A change applies to the next pull, upload or container; a project's own agent image is built again on a changed base."
      label="Reading the system settings"
      fields={FIELDS}
      form={SystemForm}
    />
  );
}
