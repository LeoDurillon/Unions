// The sidebar's projects (with Add project) and its Union settings entry; on the rail, a project
// shows the first two letters of its name.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { RAIL_ONLY, SIDE_ITEM, SIDE_LABEL } from './sidebar-classes';
import { Button } from './ui';

const ACTIVE = 'bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200';
const IDLE = 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800';

function ProjectItem({
  project,
  active,
  onSelect,
}: {
  project: PublicProject;
  active: boolean;
  onSelect: (id: number) => void;
}): ReactElement {
  const name = `${project.owner}/${project.repo}`;
  return (
    <li>
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        title={name}
        onClick={() => {
          onSelect(project.id);
        }}
        className={`${SIDE_ITEM} ${active ? ACTIVE : IDLE}`}
      >
        <span aria-hidden className={`${RAIL_ONLY} text-xs font-semibold`}>
          {project.repo.slice(0, 2)}
        </span>
        <span className={SIDE_LABEL}>
          <span className="text-zinc-500">{project.owner}/</span>
          {project.repo}
        </span>
      </button>
    </li>
  );
}

/** The projects, with the + that adds one beside their heading. */
export function ProjectNav({
  projects,
  activeId,
  onSelect,
  onNewProject,
}: {
  projects: PublicProject[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNewProject: () => void;
}): ReactElement {
  return (
    <nav aria-label="Projects" className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between pr-1 pb-1 pl-3 group-data-[compact]/side:justify-center group-data-[compact]/side:p-0 group-data-[compact]/side:pb-1">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase group-data-[compact]/side:sr-only">
          Projects
        </p>
        <button
          type="button"
          aria-label="Add project"
          title="Add project"
          onClick={onNewProject}
          className="flex size-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <PlusIcon />
        </button>
      </div>
      <ul className="space-y-0.5">
        {projects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            active={project.id === activeId}
            onSelect={onSelect}
          />
        ))}
      </ul>
      {projects.length === 0 ? (
        <Button className="mx-3 group-data-[compact]/side:hidden" onClick={onNewProject}>
          + Add project
        </Button>
      ) : null}
    </nav>
  );
}

function PlusIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

function GearIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      />
    </svg>
  );
}

/** The settings every project shares, below the projects. */
export function SettingsLink({
  active,
  onOpen,
}: {
  active: boolean;
  onOpen: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      title="Union settings"
      onClick={onOpen}
      className={`${SIDE_ITEM} ${active ? ACTIVE : IDLE}`}
    >
      <GearIcon />
      <span className={SIDE_LABEL}>Union settings</span>
    </button>
  );
}
