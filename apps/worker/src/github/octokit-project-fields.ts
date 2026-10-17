// The GitHub Project fields of the worker's GitHub client: reading them, setting one on an item, a pull request's node id.
import {
  CLEAR_PROJECT_FIELD,
  parseProjectFields,
  PROJECT_FIELDS,
  SET_PROJECT_FIELD,
  type ProjectFieldsResponse,
  type RemoteProjectField,
} from '@union/core';

import type { ProjectFieldChange, RepoRef } from './api';
import { OctokitChecks } from './octokit-checks';

export class OctokitProjectFields extends OctokitChecks {
  async projectFields(projectNodeId: string): Promise<RemoteProjectField[]> {
    const data = await this.octokit.graphql<ProjectFieldsResponse>(PROJECT_FIELDS, {
      id: projectNodeId,
    });
    const fields = parseProjectFields(data);
    if (!fields) {
      throw new Error(`Project ${projectNodeId} was not found`);
    }
    return fields;
  }

  async setProjectField({
    projectNodeId,
    itemId,
    fieldId,
    value,
  }: ProjectFieldChange): Promise<void> {
    const ids = { projectId: projectNodeId, itemId, fieldId };
    await (value === null
      ? this.octokit.graphql(CLEAR_PROJECT_FIELD, ids)
      : this.octokit.graphql(SET_PROJECT_FIELD, { ...ids, value }));
  }

  async pullRequestNodeId(repo: RepoRef, number: number): Promise<string> {
    const { data } = await this.octokit.rest.pulls.get({ ...repo, pull_number: number });
    return data.node_id;
  }
}
