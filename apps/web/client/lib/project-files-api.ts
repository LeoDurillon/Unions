// The browser's client for a project's uploaded files.
import type { ProjectFileView } from '../../src/routes/project-files';
import { ApiError, errorMessage, request } from './api';

function filesPath(projectId: number): string {
  return `/api/projects/${projectId}/files`;
}

/** The file is the request body, streamed: a database dump never sits in memory as a form. */
async function upload(projectId: number, path: string, file: File): Promise<ProjectFileView> {
  const response = await fetch(`${filesPath(projectId)}?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: file,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.statusText), response.status);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same trust boundary as `request`: the server returns the file's row
  return data as ProjectFileView;
}

export const projectFilesApi = {
  list: (projectId: number): Promise<ProjectFileView[]> => request('GET', filesPath(projectId)),
  upload,
  remove: (projectId: number, fileId: number): Promise<unknown> =>
    request('DELETE', `${filesPath(projectId)}/${fileId}`),
};
