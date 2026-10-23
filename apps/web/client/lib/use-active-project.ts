// The project list plus the remembered selection, falling back to the first project.
import { useQuery } from '@tanstack/react-query';

import type { PublicProject } from '../../src/api-types';
import { api } from './api';
import { useStoredNumber } from './use-stored-number';

/** The project list plus the remembered selection, falling back to the first project. */
export function useActiveProject(): {
  projects: PublicProject[];
  project: PublicProject | null;
  select: (id: number) => void;
  loading: boolean;
} {
  const query = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const [stored, select] = useStoredNumber('union.project');
  const projects = query.data ?? [];
  const project = projects.find((candidate) => candidate.id === stored) ?? projects[0] ?? null;
  return { projects, project, select, loading: query.isPending };
}
