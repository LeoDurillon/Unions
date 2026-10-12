import type { ReactElement } from 'react';

export type AccessMethod = 'token' | 'app';

const METHODS: { id: AccessMethod; label: string }[] = [
  { id: 'token', label: 'Personal access token' },
  { id: 'app', label: 'GitHub App' },
];

/** Token or GitHub App: the two ways a project can reach GitHub. */
export function AccessMethodTabs({
  method,
  onChange,
}: {
  method: AccessMethod;
  onChange: (method: AccessMethod) => void;
}): ReactElement {
  return (
    <fieldset className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
      <legend className="sr-only">GitHub access</legend>
      {METHODS.map(({ id, label }) => (
        <label
          key={id}
          className={`cursor-pointer rounded-md px-3 py-1 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${method === id ? 'bg-indigo-600 text-white' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
        >
          <input
            type="radio"
            name="github-access"
            className="sr-only"
            checked={method === id}
            onChange={() => {
              onChange(id);
            }}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
