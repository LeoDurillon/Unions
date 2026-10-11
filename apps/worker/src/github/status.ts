import { BOARD_STATUSES, type BoardStatus } from '@union/core';

import type { ProjectInfo } from './api';

const DEFAULT_OPTION_NAMES: Record<BoardStatus, string> = {
  backlog: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
};

type OptionNames = Partial<Record<BoardStatus, string>> | undefined;

function configured(names: OptionNames): Record<BoardStatus, string> {
  return { ...DEFAULT_OPTION_NAMES, ...names };
}

function findOption(info: ProjectInfo, name: string): { name: string; id: string } | undefined {
  const wanted = name.toLowerCase();
  const entry = Object.entries(info.options).find(([option]) => option.toLowerCase() === wanted);
  return entry ? { name: entry[0], id: entry[1] } : undefined;
}

/**
 * Option to set for a board column. Projects created from GitHub's default template have no
 * "In Review" option, so that column falls back to "In Progress".
 */
export function optionFor(
  names: OptionNames,
  status: BoardStatus,
  info: ProjectInfo,
): { name: string; id: string } {
  const all = configured(names);
  const option =
    findOption(info, all[status]) ??
    (status === 'in_review' ? findOption(info, all.in_progress) : undefined);
  if (!option) {
    throw new Error(`Project has no Status option "${all[status]}" for column ${status}`);
  }
  return option;
}

export function boardStatusFor(names: OptionNames, optionName: string | null): BoardStatus | null {
  if (optionName === null) {
    return null;
  }
  const all = configured(names);
  const wanted = optionName.toLowerCase();
  const match = BOARD_STATUSES.find((key) => all[key].toLowerCase() === wanted);
  return match ?? null;
}
