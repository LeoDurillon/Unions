// Files every ticket's workspace gets at a path in the repository, kept out of git. For example a
// database dump for the preview's seed, a local config.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBytes } from '@union/core/attachment-limits';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useLeaveGuard } from '../../lib/app/leave-guard';
import { projectFilesApi } from '../../lib/settings/project-files-api';
import { Dropzone } from '../ui/dropzone';
import { Button, ErrorText, inputClass } from '../ui/ui';
import { FileList } from './project-file-list';
import { SettingsIntro } from './settings-intro';

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
    <>
      <SettingsIntro>
        Put in every ticket&apos;s workspace at their path in the repository, before each agent step
        and each preview start, and kept out of git: a push that contains one is refused. Agents and
        previews can read them; nobody can download them from here. Uploading to a path already used
        replaces that file.
      </SettingsIntro>
      <section className="space-y-3">
        <ErrorText error={files.error} />
        <FileList projectId={project.id} files={files.data ?? []} />
        <UploadForm projectId={project.id} />
      </section>
    </>
  );
}
