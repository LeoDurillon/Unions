// The preview's Reset: drops its containers, volumes and built images, and the data folders the user
// ticks (the mounted folders git ignores), then starts it fresh, after a confirmation.
import { useState, type ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import type { PreviewCalls } from '../lib/use-preview';
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

/** Drops everything the preview holds and starts it fresh: shown once there is something to drop. */
export function ResetButton({
  view,
  calls,
  act,
  busy,
}: {
  view: PreviewView;
  calls: PreviewCalls;
  act: Act;
  busy: boolean;
}): ReactElement | null {
  const [asking, setAsking] = useState(false);
  if (view.preview === null && view.resetRefusal !== null) {
    return null;
  }
  const disabled = busy || view.resetRefusal !== null;
  if (!asking) {
    return (
      <Button
        variant="quietDanger"
        disabled={disabled}
        title={view.resetRefusal ?? undefined}
        onClick={() => {
          setAsking(true);
        }}
      >
        Reset preview
      </Button>
    );
  }
  return (
    <ResetConfirm
      folders={view.preview?.dataFolders ?? []}
      disabled={disabled}
      onReset={(chosen) => {
        setAsking(false);
        act(() => calls.reset(chosen));
      }}
      onKeep={() => {
        setAsking(false);
      }}
    />
  );
}
