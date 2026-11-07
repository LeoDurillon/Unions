// Picks the GitHub Project a project's board mirrors to: one of the repository owner's, or a new one by title.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { ProjectOption, PublicProject } from '../../../src/api-types';
import { githubProjectApi, type GitHubProjectChoice } from '../../lib/github-project-api';
import { Button, ErrorText, inputClass } from '../ui';

const NEW = 'new';

function NewProjectChoice({
  picked,
  title,
  onPick,
  onTitle,
}: {
  picked: boolean;
  title: string;
  onPick: () => void;
  onTitle: (title: string) => void;
}): ReactElement {
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="github-project" checked={picked} onChange={onPick} />
        Create a new project
      </label>
      {picked ? (
        <input
          className={inputClass}
          value={title}
          aria-label="New project title"
          onChange={(event) => {
            onTitle(event.target.value);
          }}
        />
      ) : null}
    </>
  );
}

/** The owner's open Projects as radio rows, then "Create a new project" with its title. */
function Choices({
  project,
  choices,
  picked,
  title,
  onPick,
  onTitle,
}: {
  project: PublicProject;
  choices: UseQueryResult<ProjectOption[]>;
  picked: string;
  title: string;
  onPick: (id: string) => void;
  onTitle: (title: string) => void;
}): ReactElement {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">GitHub Project</legend>
      <ErrorText error={choices.error} />
      {choices.isPending ? (
        <p className="text-sm text-zinc-500">Loading the projects of {project.owner}…</p>
      ) : null}
      {(choices.data ?? []).map((option) => (
        <label key={option.id} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="github-project"
            checked={picked === option.id}
            onChange={() => {
              onPick(option.id);
            }}
          />
          {option.title} <span className="text-xs text-zinc-500">#{option.number}</span>
        </label>
      ))}
      <NewProjectChoice
        picked={picked === NEW}
        title={title}
        onPick={() => {
          onPick(NEW);
        }}
        onTitle={onTitle}
      />
    </fieldset>
  );
}

function choiceOf(
  picked: string,
  title: string,
  options: { id: string; url: string }[],
): GitHubProjectChoice | null {
  if (picked === NEW) {
    return title.trim() === '' ? null : { title: title.trim() };
  }
  const option = options.find((candidate) => candidate.id === picked);
  return option ? { nodeId: option.id, url: option.url } : null;
}

/** Connects at once on Connect: the worker adds every ticket's issue to the board on its next sync. */
export function GitHubProjectPicker({
  project,
  onDone,
}: {
  project: PublicProject;
  onDone: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState('');
  const [title, setTitle] = useState(`${project.repo} board`);
  const choices = useQuery({
    queryKey: ['github-project-choices', project.id],
    queryFn: () => githubProjectApi.choices(project.id),
  });
  const choice = choiceOf(picked, title, choices.data ?? []);
  const connect = useMutation({
    mutationFn: (next: GitHubProjectChoice) => githubProjectApi.connect(project.id, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      onDone();
    },
  });
  return (
    <div className="space-y-3">
      <Choices
        project={project}
        choices={choices}
        picked={picked}
        title={title}
        onPick={setPicked}
        onTitle={setTitle}
      />
      <ErrorText error={connect.error} />
      <Button
        variant="primary"
        disabled={choice === null || connect.isPending}
        onClick={() => {
          if (choice) {
            connect.mutate(choice);
          }
        }}
      >
        Connect
      </Button>
    </div>
  );
}
