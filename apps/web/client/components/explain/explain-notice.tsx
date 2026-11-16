// The notice after a part of the diff was added to an Explain conversation: its title, Open and ✕, gone after a while.

import { useEffect, type ReactElement } from 'react';

import { useExplain } from './explain-context';

/** How long the notice stays, unless a new one replaces it. */
const SHOWN_MS = 6000;

function noCleanup(): void {
  // No notice: no timer to clear.
}

export function ExplainNotice(): ReactElement | null {
  const explain = useExplain();
  const notice = explain?.collect.notice ?? null;
  const dismiss = explain?.collect.dismiss;
  useEffect(() => {
    if (!notice || !dismiss) {
      return noCleanup;
    }
    const timer = setTimeout(dismiss, SHOWN_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice, dismiss]);
  if (!explain || !notice) {
    return null;
  }
  return (
    <output className="fixed right-6 bottom-6 z-40 flex max-w-md items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
      <span className="min-w-0 flex-1 truncate">
        Added to <span className="font-medium">“{notice.title}”</span>
      </span>
      <button
        type="button"
        className="shrink-0 font-medium text-indigo-700 hover:underline dark:text-indigo-300"
        onClick={() => {
          explain.collect.dismiss();
          explain.conversation.open(notice.conversationId);
        }}
      >
        Open
      </button>
      <button
        type="button"
        aria-label="Close the notice"
        className="shrink-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        onClick={() => {
          explain.collect.dismiss();
        }}
      >
        ✕
      </button>
    </output>
  );
}
