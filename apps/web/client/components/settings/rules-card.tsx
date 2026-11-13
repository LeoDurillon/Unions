// The Rules page's cards: the trackers' columns the rules can set, then the rules, editing one and adding one.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventRule, NotionSchema } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { EventRulesResponse } from '../../../src/event-api-types';
import { eventRulesApi, newRule, type RuleDraft } from '../../lib/settings/event-rules-api';
import { Button, ErrorText } from '../ui/ui';
import { RuleEditor } from './rule-editor';
import { RuleRow } from './rule-list';
import { TrackerBars } from './tracker-bars';

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

/** The trackers' columns, then the rules in a card: the one being edited, and the button to add one. */
export function Rules({
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
  const firstRead = data?.trackers.find((tracker) => tracker.read)?.kind ?? null;
  return (
    <>
      <TrackerBars projectId={projectId} data={data} onRefreshed={() => writes.refresh()} />
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Rules</h3>
        <ErrorText error={writes.remove.error} />
        {editing === null ? null : (
          <RuleEditor
            projectId={projectId}
            notion={notion}
            initial={editing === 'new' ? newRule(firstRead) : draftOf(editing)}
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
      </section>
    </>
  );
}
