import { appAuth, getGitHubApp, type Db, type GitHubAppRow, type GitHubAuth } from '@union/core';

import { BAD_REQUEST, CONFLICT, fail, optionalText } from './http';

export function requireApp(db: Db): GitHubAppRow {
  const app = getGitHubApp(db);
  if (!app) {
    throw fail(CONFLICT, 'No GitHub App is set up: add one in the GitHub App settings first');
  }
  return app;
}

/** A GitHub installation id from the body, when one is given. */
export function optionalInstallationId(body: Record<string, unknown>): number | undefined {
  const value = body.installationId;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw fail(BAD_REQUEST, '"installationId" must be a positive integer');
  }
  return value;
}

/**
 * The credentials a wizard request carries: `{ installationId }` (the stored GitHub App) or
 * `{ token }`. The app's private key stays on the server.
 */
export function requestAuth(db: Db, body: Record<string, unknown>): GitHubAuth {
  const installationId = optionalInstallationId(body);
  if (installationId !== undefined) {
    return appAuth(requireApp(db), installationId);
  }
  const token = optionalText(body, 'token');
  if (!token) {
    throw fail(BAD_REQUEST, 'Give a "token" or an "installationId"');
  }
  return { kind: 'token', token };
}
