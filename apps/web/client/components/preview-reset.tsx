// The preview's Reset: drops its containers, volumes and built images, and the data folders the user
// ticks (the mounted folders git ignores), then starts it fresh, after a confirmation.

import { useState, type ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import type { PreviewCalls } from '../lib/preview/use-preview';
import type { Act } from './preview-controls';
import { Button } from './ui';

const RESET_QUESTION =
  "Remove the preview's containers, volumes (its databases) and the images it built, then start it again? The code in the workspace is kept.";

/** A box per data folder found at the last start: emptied with the rest when ticked. */
function FolderChoices({
  folders,
  chosen,
  onChange,
}: {
  folders: string[];
  chosen: string[];
  onChange: (chosen: string[]) => void;
}): ReactElement | null {
  if (folders.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1">
      {folders.map((folder) => (
        <li key={folder}>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={chosen.includes(folder)}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? [...chosen, folder]
                    : chosen.filter((other) => other !== folder),
                );
              }}
            />
            <span>
              Also empty <code>{folder}/</code> (git ignores it)
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** The question, the folders to empty too, and the choice: a new question starts with none ticked. */
function ResetConfirm({
  folders,
  disabled,
  onReset,
  onKeep,
}: {
  folders: string[];
  disabled: boolean;
  onReset: (chosen: string[]) => void;
  onKeep: () => void;
}): ReactElement {
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <div className="w-full space-y-2 text-sm">
      <p>{RESET_QUESTION}</p>
      <FolderChoices folders={folders} chosen={chosen} onChange={setChosen} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          disabled={disabled}
          onClick={() => {
            onReset(chosen);
          }}
        >
          Reset and start
        </Button>
        <Button onClick={onKeep}>Keep it</Button>
      </div>
    </div>
  );
}

/** Whether Reset is offered: once there is something to drop. */
export function canOfferReset(view: PreviewView): boolean {
  return view.preview !== null || view.resetRefusal === null;
}

/** The confirmation of a Reset chosen from the menu: dropping everything, then starting fresh. */
export function ResetPanel({
  view,
  calls,
  act,
  busy,
  onClose,
}: {
  view: PreviewView;
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
  onClose: () => void;
}): ReactElement {
  return (
    <div className="rounded-md border border-red-200 p-3 dark:border-red-900">
      <ResetConfirm
        folders={view.preview?.dataFolders ?? []}
        disabled={busy || view.resetRefusal !== null}
        onReset={(chosen) => {
          onClose();
          act(() => calls.reset(chosen));
        }}
        onKeep={onClose}
      />
    </div>
  );
}
