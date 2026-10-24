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
          className="flex size-6 items-center justify-center rounded text-base leading-none text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          +
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

function GearIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
      <path d="M8.3 1.9a1 1 0 0 1 1-.9h1.4a1 1 0 0 1 1 .9l.2 1.6c.5.2 1 .5 1.4.8l1.5-.6a1 1 0 0 1 1.2.4l.7 1.2a1 1 0 0 1-.2 1.3l-1.3 1c.1.5.1 1.1 0 1.6l1.3 1a1 1 0 0 1 .2 1.3l-.7 1.2a1 1 0 0 1-1.2.4l-1.5-.6c-.4.3-.9.6-1.4.8l-.2 1.6a1 1 0 0 1-1 .9H9.3a1 1 0 0 1-1-.9l-.2-1.6c-.5-.2-1-.5-1.4-.8l-1.5.6a1 1 0 0 1-1.2-.4l-.7-1.2a1 1 0 0 1 .2-1.3l1.3-1a4.6 4.6 0 0 1 0-1.6l-1.3-1a1 1 0 0 1-.2-1.3l.7-1.2a1 1 0 0 1 1.2-.4l1.5.6c.4-.3.9-.6 1.4-.8l.2-1.6ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
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
