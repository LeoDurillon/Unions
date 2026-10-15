import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBytes } from '@union/core/attachment-limits';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import type { ProjectFileView } from '../../../src/routes/project-files';
import { useLeaveGuard } from '../../lib/leave-guard';
import { projectFilesApi } from '../../lib/project-files-api';
import { Dropzone } from '../dropzone';
import { Button, ErrorText, inputClass } from '../ui';

function FileList({
  projectId,
  files,
}: {
  projectId: number;
  files: ProjectFileView[];
}): ReactElement {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (fileId: number) => projectFilesApi.remove(projectId, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-files', projectId] }),
  });
  if (files.length === 0) {
    return <p className="text-xs text-zinc-500">No files yet.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-3 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</span>
            <span className="text-xs text-zinc-500">{formatBytes(file.size)}</span>
            <span className="text-xs text-zinc-500">
              {new Date(file.updatedAt).toLocaleString()}
            </span>
            <button
              type="button"
              className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(file.id);
              }}
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <ErrorText error={remove.error} />
    </>
  );
}

function UploadForm({ projectId }: { projectId: number }): ReactElement {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState('');
  useLeaveGuard(file !== null);
  const upload = useMutation({
    mutationFn: (picked: File) => projectFilesApi.upload(projectId, path.trim(), picked),
    onSuccess: async () => {
      setFile(null);
      setPath('');
      await queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
    },
  });
  return (
    <div className="space-y-2">
      <Dropzone
        label="Choose a file"
        hint={file ? `${file.name} (${formatBytes(file.size)})` : undefined}
        onFiles={([picked]) => {
          if (picked) {
            setFile(picked);
            if (path.trim() === '') {
              setPath(picked.name);
            }
          }
        }}
      />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          aria-label="Path in the repository"
          className={`${inputClass} font-mono`}
          value={path}
          placeholder="goreno.sql"
          onChange={(event) => {
            setPath(event.target.value);
          }}
        />
        <Button
          disabled={!file || path.trim() === '' || upload.isPending}
          onClick={() => {
            if (file) {
              upload.mutate(file);
            }
          }}
        >
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      <ErrorText error={upload.error} />
    </div>
  );
}

/**
 * Files every ticket's workspace gets at a path in the repository (a database dump for the
 * preview's seed, a local config), kept out of git. Uploading to a path already used replaces it.
 */
export function FilesSection({ project }: { project: PublicProject }): ReactElement {
  const files = useQuery({
    queryKey: ['project-files', project.id],
    queryFn: () => projectFilesApi.list(project.id),
  });
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Project files</h3>
      <p className="text-xs text-zinc-500">
        Put in every ticket&apos;s workspace at their path in the repository, before each agent step
        and each preview start, and kept out of git: a push that contains one is refused. Agents and
        previews can read them; nobody can download them from here. Uploading to a path already used
        replaces that file.
      </p>
      <ErrorText error={files.error} />
      <FileList projectId={project.id} files={files.data ?? []} />
      <UploadForm projectId={project.id} />
    </section>
  );
}
