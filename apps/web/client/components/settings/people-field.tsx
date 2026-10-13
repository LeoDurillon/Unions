import type { ReactElement } from 'react';

import { joinChoices, splitChoices } from '../../lib/choice-values';
import { useNotionUsers } from '../../lib/use-notion-users';
import { ErrorText } from '../ui';

const CAPABILITY_HINT =
  'Union lists the members only if the Notion integration has the "Read user information" capability (notion.so/profile/integrations → the integration → Capabilities).';

/** A person property: a box per workspace member; the value is their Notion ids. */
export function PeopleField({
  projectId,
  value,
  onChange,
}: {
  projectId: number;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const users = useNotionUsers(projectId);
  const members = users.data ?? [];
  const picked = splitChoices(value);
  // Someone picked before who is no longer listed stays visible, so they can be removed.
  const gone = users.isPending
    ? []
    : picked.filter((id) => !members.some((member) => member.id === id));
  const boxes = [...members, ...gone.map((id) => ({ id, name: `Unknown member (${id})` }))];
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">People</legend>
      {users.isPending ? <p className="text-sm text-zinc-500">Reading the members…</p> : null}
      <ErrorText error={users.error} />
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        {boxes.map((member) => (
          <label key={member.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={picked.includes(member.id)}
              onChange={(event) => {
                onChange(
                  joinChoices(
                    event.target.checked
                      ? [...picked, member.id]
                      : picked.filter((id) => id !== member.id),
                  ),
                );
              }}
            />
            {member.name}
          </label>
        ))}
      </span>
      {users.isError || (users.isSuccess && members.length === 0) ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{CAPABILITY_HINT}</p>
      ) : (
        <p className="text-xs text-zinc-500">None checked: the rule empties the property.</p>
      )}
    </fieldset>
  );
}

/** The names of the people a rule sets, as the rule list shows them. */
export function PeopleNames({
  projectId,
  value,
}: {
  projectId: number;
  value: string;
}): ReactElement {
  const users = useNotionUsers(projectId, value !== '');
  const ids = splitChoices(value);
  if (ids.length === 0) {
    return <code className="font-mono">(nobody)</code>;
  }
  const names = ids.map(
    (id) => users.data?.find((member) => member.id === id)?.name ?? 'unknown member',
  );
  return <span className="font-medium">{names.join(', ')}</span>;
}
