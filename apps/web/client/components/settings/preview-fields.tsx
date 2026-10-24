// Compose YAML merged over the repository's file, for what Union adds without changing the
// repository: a restore or seed service, a health check, an extra dependency.
import { PREVIEW_TEMPLATES } from '@union/core/preview';
import type { ReactElement } from 'react';

import { Field, inputClass } from '../ui';

export function TextField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label} hint={hint}>
      <input
        className={`${inputClass} font-mono`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

const ENV_HINT = `KEY=value, one per line: given to every service and to \${VAR} in the compose file. Plain values: anyone with access to Union sees them here; use a secret for passwords.`;

export function Variables({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label="Variables" hint={ENV_HINT}>
      <textarea
        className={`${inputClass} h-32 font-mono text-xs`}
        value={value}
        placeholder="API_URL={service.api.url}"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <span className="flex flex-wrap gap-1">
        {PREVIEW_TEMPLATES.map((template) => (
          <button
            key={template.name}
            type="button"
            title={template.description}
            className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs hover:bg-indigo-100 dark:bg-zinc-800 dark:hover:bg-indigo-950"
            onClick={() => {
              onChange(`${value}{${template.name}}`);
            }}
          >
            {`{${template.name}}`}
          </button>
        ))}
      </span>
    </Field>
  );
}

const ADDITIONS_PLACEHOLDER = `services:
  seed:
    image: postgres:15-alpine
    command: psql -f /repo/seed.sql
  api:
    depends_on:
      seed:
        condition: service_completed_successfully`;

/**
 * Compose YAML merged over the repository's file, for what Union adds without changing the
 * repository: a restore or seed service, a health check, an extra dependency.
 */
export function AdditionsField({
  composeFile,
  value,
  onChange,
}: {
  composeFile: string;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field
      label="Compose additions"
      hint={`Optional. Merged over ${composeFile || 'the compose file'} like a second -f file: new services, or keys added to existing ones. Relative paths start from that file's folder. Never written to the repository; checked like the rest.`}
    >
      <textarea
        className={`${inputClass} h-96 resize-y font-mono text-xs`}
        value={value}
        spellCheck={false}
        placeholder={ADDITIONS_PLACEHOLDER}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}
