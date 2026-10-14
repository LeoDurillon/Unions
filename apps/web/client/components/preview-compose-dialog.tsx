import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Preview } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PreviewView } from '../../src/api-types';
import { previewApi } from '../lib/preview-api';
import { Button, Dialog, ErrorText } from './ui';

/** Where the file shown comes from, and what Start will do with it. */
function sourceLine(preview: Preview | null, composeFile: string): string {
  if (preview?.override && preview.overrideAt) {
    return `Your file for this ticket, saved ${new Date(preview.overrideAt).toLocaleString()}. Start runs it as it is: changes to ${composeFile} in the branch are not used while it is set.`;
  }
  if (preview?.composeYaml && preview.composeAt) {
    return `Generated ${new Date(preview.composeAt).toLocaleString()} from ${composeFile}. Start generates it again from the branch; save an edit to keep your own version.`;
  }
  return `Not generated yet: Generate reads ${composeFile} from the ticket's workspace without starting anything.`;
}

function useFileActions(ticketId: number): {
  handleSave: (yaml: string | null) => void;
  handleGenerate: () => void;
  busy: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (run: () => Promise<PreviewView>) => run(),
    onSuccess: (view) => {
      queryClient.setQueryData(['ticket', ticketId, 'preview'], view);
    },
  });
  return {
    handleSave: (yaml) => {
      mutation.mutate(() => previewApi.saveOwnFile(ticketId, yaml));
    },
    handleGenerate: () => {
      mutation.mutate(() => previewApi.generate(ticketId));
    },
    busy: mutation.isPending,
    error: mutation.error,
  };
}

type Actions = ReturnType<typeof useFileActions>;

function FileButtons({
  view,
  text,
  shown,
  actions,
}: {
  view: PreviewView;
  text: string;
  shown: string;
  actions: Actions;
}): ReactElement {
  const { preview } = view;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        disabled={actions.busy || text.trim() === '' || text === shown}
        onClick={() => {
          actions.handleSave(text);
        }}
      >
        Save as this ticket&apos;s file
      </Button>
      {preview?.override ? (
        <Button
          disabled={actions.busy}
          onClick={() => {
            actions.handleSave(null);
          }}
        >
          Use the generated file again
        </Button>
      ) : null}
      <Button
        disabled={actions.busy || view.refusal !== null}
        title={view.refusal ?? undefined}
        onClick={actions.handleGenerate}
      >
        {preview?.composeYaml ? 'Generate again' : 'Generate'}
      </Button>
    </div>
  );
}

function Editor({ ticketId, view }: { ticketId: number; view: PreviewView }): ReactElement {
  const { preview } = view;
  const shown = preview?.override ?? preview?.composeYaml ?? '';
  const [text, setText] = useState(shown);
  const actions = useFileActions(ticketId);
  const refused = preview?.override ? null : (preview?.composeError ?? null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        {sourceLine(preview, view.composeFile ?? 'the compose file')}
      </p>
      {refused ? (
        <pre className="text-xs whitespace-pre-wrap text-red-600 dark:text-red-400">{refused}</pre>
      ) : null}
      <textarea
        aria-label="Compose file"
        className="h-[60vh] w-full rounded-md border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <ErrorText error={actions.error} />
      <FileButtons view={view} text={text} shown={shown} actions={actions} />
      <p className="text-xs text-zinc-500">
        Changes apply at the next Start or Restart. Your file is checked like the generated one (no
        host access, nothing outside the repository); it keeps the ticket&apos;s project name, so
        its containers stay apart from other previews. Host ports you add are published.
      </p>
    </div>
  );
}

/** The compose file a preview runs, to read and to edit for this ticket. */
export function PreviewComposeDialog({
  ticketId,
  view,
  open,
  onClose,
}: {
  ticketId: number;
  view: PreviewView;
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const { preview } = view;
  return (
    <Dialog open={open} onClose={onClose} title="Preview compose file" wide>
      <Editor
        key={`${preview?.overrideAt ?? 0}-${preview?.composeAt ?? 0}`}
        ticketId={ticketId}
        view={view}
      />
    </Dialog>
  );
}
