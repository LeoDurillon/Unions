// Project settings → Integrations → GitHub Project: the board the tickets mirror to, connected, changed or disconnected.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { githubProjectApi, hasBoard } from '../../lib/settings/github-project-api';
import { SettingsIntro } from '../settings/settings-intro';
import { Badge, Button, ErrorText } from '../ui/ui';
import { GitHubProjectPicker } from './github-project-picker';

const ABOUT =
  'A GitHub Project shows the tickets as cards: each ticket’s issue is added to it and its card follows the ticket’s column. Moving a card to In Progress on GitHub starts the ticket. Without one, Union’s board is the only board.';

/** The connected board, with Change and Disconnect; disconnecting leaves the board and its cards on GitHub. */
function Connected({
  project,
  onChange,
}: {
  project: PublicProject;
  onChange: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: () => githubProjectApi.disconnect(project.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  return (
    <div className="space-y-3">
      {project.githubProjectUrl ? (
        <a
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          href={project.githubProjectUrl}
          target="_blank"
          rel="noreferrer"
        >
          {project.githubProjectUrl}
        </a>
      ) : null}
      <p className="text-xs text-zinc-500">
        Disconnecting stops updating the board; the board and its cards stay on GitHub as they are.
        Tickets keep their issues.
      </p>
      <ErrorText error={disconnect.error} />
      <div className="flex gap-2">
        <Button onClick={onChange}>Change</Button>
        <Button
          disabled={disconnect.isPending}
          onClick={() => {
            disconnect.mutate();
          }}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

export function GitHubProjectSection({ project }: { project: PublicProject }): ReactElement {
  const connected = hasBoard(project);
  const [picking, setPicking] = useState(false);
  return (
    <>
      <SettingsIntro>{ABOUT}</SettingsIntro>
      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Board
          <Badge tone={connected ? 'green' : 'neutral'}>
            {connected ? 'connected' : 'not connected'}
          </Badge>
        </h3>
        {connected && !picking ? (
          <Connected
            project={project}
            onChange={() => {
              setPicking(true);
            }}
          />
        ) : (
          <GitHubProjectPicker
            project={project}
            onDone={() => {
              setPicking(false);
            }}
          />
        )}
      </section>
    </>
  );
}
