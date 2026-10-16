// The GitHub Project fields of the in-memory GitHub for tests: the fields, and what each item holds; the base of `FakeGitHubApi`.
import type { ProjectFieldInput, RemoteProjectField } from '@union/core';

import type { ProjectFieldChange, RepoRef } from './api';

function select(id: string, name: string, options: string[]): RemoteProjectField {
  return {
    id,
    name,
    type: 'single_select',
    options,
    optionIds: Object.fromEntries(options.map((option) => [option, `o_${option}`])),
  };
}

const DEFAULT_FIELDS: RemoteProjectField[] = [
  select('F_area', 'Area', ['UI', 'API']),
  { id: 'F_due', name: 'Due', type: 'date', options: [], optionIds: {} },
  { id: 'F_notes', name: 'Notes', type: 'text', options: [], optionIds: {} },
  { id: 'F_sprint', name: 'Sprint', type: 'number', options: [], optionIds: {} },
  select('F_status', 'Status', ['Todo', 'In Progress', 'Done']),
];

export class FakeProjectFields {
  /** Every method name called, in order. */
  readonly calls: string[] = [];
  /** The Project's fields; tests change them to simulate an edit on GitHub. */
  fields: RemoteProjectField[] = DEFAULT_FIELDS;
  /** Item id → field id → the value set (null: cleared). */
  readonly itemFields = new Map<string, Record<string, ProjectFieldInput>>();

  projectFields(): Promise<RemoteProjectField[]> {
    this.calls.push('projectFields');
    return Promise.resolve(this.fields);
  }

  setProjectField({ itemId, fieldId, value }: ProjectFieldChange): Promise<void> {
    this.calls.push('setProjectField');
    this.itemFields.set(itemId, { ...this.itemFields.get(itemId), [fieldId]: value });
    return Promise.resolve();
  }

  pullRequestNodeId(_repo: RepoRef, number: number): Promise<string> {
    this.calls.push('pullRequestNodeId');
    return Promise.resolve(`PR_${number}`);
  }
}
