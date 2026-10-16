import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventRule, NotionSchema } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import type { EventRulesResponse } from '../../../src/event-api-types';
import { eventRulesApi, newRule, type RuleDraft } from '../../lib/event-rules-api';
import { Button, ErrorText } from '../ui';
import { RuleEditor } from './rule-editor';
import { DeliveryList, RuleRow } from './rule-list';

function NotionColumns({
  projectId,
  notion,
  onRefreshed,
}: {
  projectId: number;
  notion: NotionSchema | null;
  onRefreshed: () => Promise<void>;
}): ReactElement {
  const refresh = useMutation({
    mutationFn: () => eventRulesApi.refreshNotion(projectId),
    onSuccess: onRefreshed,
  });
  return (
    <div className="flex items-center gap-3 text-sm">
      <p className="min-w-0 flex-1 text-zinc-500">
        {notion
          ? `Notion columns of “${notion.title}”, read ${new Date(notion.fetchedAt).toLocaleString()} (${notion.properties.length} properties).`
          : 'The Notion columns are not read yet.'}
      </p>
      <ErrorText error={refresh.error} />
      <Button
        disabled={refresh.isPending}
        onClick={() => {
          refresh.mutate();
        }}
      >
        {refresh.isPending ? 'Reading…' : 'Refresh from Notion'}
      </Button>
    </div>
  );
}

function draftOf(rule: EventRule): RuleDraft {
  return { name: rule.name, enabled: rule.enabled, trigger: rule.trigger, action: rule.action };
}

function useRuleWrites(
  projectId: number,
  onSaved: () => void,
): {
  save: ReturnType<typeof useMutation<unknown, Error, { id: number | null; rule: RuleDraft }>>;
  remove: ReturnType<typeof useMutation<unknown, Error, number>>;
  refresh: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['event-rules', projectId] });
  return {
    save: useMutation({
      mutationFn: ({ id, rule }: { id: number | null; rule: RuleDraft }) =>
        id === null
          ? eventRulesApi.create(projectId, rule)
          : eventRulesApi.update(projectId, id, rule),
      onSuccess: async () => {
        await refresh();
        onSaved();
      },
    }),
    remove: useMutation({
      mutationFn: (id: number) => eventRulesApi.remove(projectId, id),
      onSuccess: refresh,
    }),
    refresh,
  };
}

type Writes = ReturnType<typeof useRuleWrites>;

function RuleItems({
  projectId,
  rules,
  notion,
  writes,
  onEdit,
}: {
  projectId: number;
  rules: EventRule[];
  notion: NotionSchema | null;
  writes: Writes;
  onEdit: (rule: EventRule) => void;
}): ReactElement {
  return (
    <ul className="space-y-2">
      {rules.map((rule) => (
        <RuleRow
          key={rule.id}
          projectId={projectId}
          rule={rule}
          notion={notion}
          onToggle={() => {
            writes.save.mutate({ id: rule.id, rule: { ...draftOf(rule), enabled: !rule.enabled } });
          }}
          onEdit={() => {
            onEdit(rule);
          }}
          onDelete={() => {
            writes.remove.mutate(rule.id);
          }}
        />
      ))}
    </ul>
  );
}

/** The rules, the one being edited, and the button to add one. */
function Rules({
  projectId,
  data,
}: {
  projectId: number;
  data: EventRulesResponse | undefined;
}): ReactElement {
  const [editing, setEditing] = useState<EventRule | 'new' | null>(null);
  const writes = useRuleWrites(projectId, () => {
    setEditing(null);
  });
  const notion = data?.notion ?? null;
  return (
    <>
      <ErrorText error={writes.remove.error} />
      {data?.hasNotion ? (
        <NotionColumns projectId={projectId} notion={notion} onRefreshed={() => writes.refresh()} />
      ) : null}
      {editing === null ? null : (
        <RuleEditor
          projectId={projectId}
          notion={notion}
          initial={editing === 'new' ? newRule(notion) : draftOf(editing)}
          saving={writes.save.isPending}
          error={writes.save.error}
          onSave={(rule) => {
            writes.save.mutate({ id: editing === 'new' ? null : editing.id, rule });
          }}
          onCancel={() => {
            writes.save.reset();
            setEditing(null);
          }}
        />
      )}
      <RuleItems
        projectId={projectId}
        rules={data?.rules ?? []}
        notion={notion}
        writes={writes}
        onEdit={setEditing}
      />
      {editing === null ? (
        <Button
          variant="primary"
          onClick={() => {
            setEditing('new');
          }}
        >
          Add rule
        </Button>
      ) : null}
    </>
  );
}

function useRules(project: PublicProject): ReturnType<typeof useQuery<EventRulesResponse>> {
  return useQuery({
    queryKey: ['event-rules', project.id],
    queryFn: () => eventRulesApi.list(project.id),
  });
}

/**
 * Event rules: when something happens to a ticket, set a property of its Notion page or comment on
 * its GitHub issue or pull request. They apply from their creation on, never to what happened before.
 */
export function EventRulesSection({ project }: { project: PublicProject }): ReactElement {
  const rules = useRules(project);
  return (
    <section className="space-y-4">
      <p className="text-sm text-zinc-500">
        When something happens to a ticket, set a property of its Notion page (tickets imported from
        Notion) or comment on its GitHub issue or pull request. Rules apply to what happens from
        their creation on.
      </p>
      <ErrorText error={rules.error} />
      <Rules projectId={project.id} data={rules.data} />
    </section>
  );
}

/** What the rules did lately: each update or comment, and why one failed. */
export function EventActivitySection({ project }: { project: PublicProject }): ReactElement {
  return (
    <section className="space-y-4">
      <p className="text-sm text-zinc-500">
        The latest Notion updates and GitHub comments the event rules made, newest first.
      </p>
      <DeliveryList projectId={project.id} />
    </section>
  );
}
