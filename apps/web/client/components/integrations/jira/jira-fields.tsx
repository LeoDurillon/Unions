// The fields of a Jira connection (site, email, API token, project key) and how to get them; settings and onboarding.
import type { ReactElement } from 'react';

import { TokenInput } from '../../onboarding/connect-step';
import { Field, inputClass } from '../../ui';

/** What the user types to connect Jira; the token is the secret, the rest its config. */
export type JiraForm = {
  site: string;
  email: string;
  token: string;
  projectKey: string;
  /** The type of the issues Union creates; empty: Task, else the project's first type. */
  issueTypeId: string;
};

/** The config the server checks, from the form. */
export function jiraConfigOf(form: JiraForm): Record<string, string> {
  const issueTypeId = form.issueTypeId.trim();
  return {
    site: form.site.trim(),
    email: form.email.trim(),
    projectKey: form.projectKey.trim(),
    ...(issueTypeId === '' ? {} : { issueTypeId }),
  };
}

/** The form from a saved config (no token: the browser never has it). */
export function jiraFormOf(config: Record<string, unknown> | undefined): JiraForm {
  const text = (name: string): string => {
    const value = config?.[name];
    return typeof value === 'string' ? value : '';
  };
  return {
    site: text('site'),
    email: text('email'),
    token: '',
    projectKey: text('projectKey'),
    issueTypeId: text('issueTypeId'),
  };
}

export function JiraHelp(): ReactElement {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500">
      <li>The site is the address you open Jira at: https://&lt;name&gt;.atlassian.net.</li>
      <li>
        Create an API token at{' '}
        <a
          className="underline"
          href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank"
          rel="noreferrer"
        >
          id.atlassian.com → Security → API tokens
        </a>{' '}
        (Create API token, without scopes), and give the email of that Atlassian account.
      </li>
      <li>The project key is the letters before an issue&apos;s number: ABC for ABC-123.</li>
      <li>
        Union acts in Jira as that account: it reads the project&apos;s issues, and moves, comments
        on or creates them only when your rules, comments or investigations ask it to.
      </li>
    </ol>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label}>
      <input
        className={inputClass}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

export function JiraFields({
  value,
  tokenHint,
  onChange,
}: {
  value: JiraForm;
  /** Under the token: how to keep the stored one, once connected. */
  tokenHint?: string;
  onChange: (value: JiraForm) => void;
}): ReactElement {
  const set = (change: Partial<JiraForm>): void => {
    onChange({ ...value, ...change });
  };
  return (
    <>
      <TextField
        label="Site"
        value={value.site}
        placeholder="https://acme.atlassian.net"
        onChange={(site) => {
          set({ site });
        }}
      />
      <TextField
        label="Account email"
        value={value.email}
        placeholder="you@example.com"
        onChange={(email) => {
          set({ email });
        }}
      />
      <Field label="API token" hint={tokenHint}>
        <TokenInput
          value={value.token}
          placeholder="ATATT…"
          onChange={(token) => {
            set({ token });
          }}
        />
      </Field>
      <TextField
        label="Project key"
        value={value.projectKey}
        placeholder="ABC"
        onChange={(projectKey) => {
          set({ projectKey });
        }}
      />
    </>
  );
}
