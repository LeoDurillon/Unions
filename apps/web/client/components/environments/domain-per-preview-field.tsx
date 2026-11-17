// The "One domain per preview" switch: services at `api.t12.union.localhost`, sharing a cookie domain.
// Off, they are at `api-t12.union.localhost`, and the only domain they share is every preview's.

import type { ReactElement } from 'react';

import { Switch } from '../ui/choice';

/** Whether the preview's services get a domain of their own, for a login cookie its apps share. */
export function DomainPerPreviewField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <Switch checked={checked} onChange={onChange}>
        <span className="font-medium">One domain per preview</span>
      </Switch>
      <p className="text-xs text-zinc-500">
        Serves <code>api</code> at <code>api.t&lt;ticket&gt;.union.localhost</code> rather than{' '}
        <code>api-t&lt;ticket&gt;.union.localhost</code>. Apps that share a login through a cookie
        on a parent domain can then set it on <code>{'{preview.host}'}</code> (
        <code>t&lt;ticket&gt;.union.localhost</code>), which no other preview gets. Running previews
        move to their new addresses at their next start.
      </p>
    </div>
  );
}
