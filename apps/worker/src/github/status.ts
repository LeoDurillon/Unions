// Maps board columns to the GitHub Project's Status options, and back.
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
  const option = fallbackOption(names, status, info);
  if (!option) {
    throw new Error(
      `Project has no Status option "${configured(names)[status]}" for column ${status}`,
    );
  }
  return option;
}

function fallbackOption(
  names: OptionNames,
  status: BoardStatus,
  info: ProjectInfo,
): { name: string; id: string } | undefined {
  const all = configured(names);
  return (
    findOption(info, all[status]) ??
    (status === 'in_review' ? findOption(info, all.in_progress) : undefined)
  );
}

/**
 * Whether `optionName` is the option `optionFor` writes for `status`: an in_review ticket shows as
 * "In Progress" on a board without "In Review", and that is not a move made on GitHub.
 */
export function showsStatus(
  names: OptionNames,
  status: BoardStatus | null,
  optionName: string | null,
  info: ProjectInfo,
): boolean {
  if (status === null || optionName === null) {
    return false;
  }
  return fallbackOption(names, status, info)?.name.toLowerCase() === optionName.toLowerCase();
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
