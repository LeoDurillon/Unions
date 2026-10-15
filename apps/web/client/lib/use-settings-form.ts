// A settings page's form: what is edited, whether it differs from what was saved, and its one Save.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useLeaveGuard } from './leave-guard';

/** What the Save bar shows and does, whatever the form holds. */
export type SaveState = {
  dirty: boolean;
  saving: boolean;
  /** Saved by this page, with nothing changed since. */
  saved: boolean;
  error: Error | null;
  save: () => void;
  discard: () => void;
};

export type SettingsForm<T> = SaveState & {
  value: T;
  set: (value: T) => void;
  /** Counts the form as unsaved whatever it holds (what was saved is gone, as after turning off). */
  forgetSaved: () => void;
};

type State<T> = { value: T; saved: T | undefined };

function same<T>(a: T, b: T | undefined): boolean {
  return b !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Starts from `initial()` and compares with what was last loaded or saved here, not with what the
 * server returns, so a value it normalises (trimmed text) does not stay "unsaved".
 */
export function useSettingsForm<T>(
  initial: () => T,
  write: (value: T) => Promise<unknown>,
): SettingsForm<T> {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State<T>>(() => {
    const value = initial();
    return { value, saved: value };
  });
  const mutation = useMutation({
    mutationFn: write,
    onSuccess: async (_result, sent) => {
      setState((previous) => ({ ...previous, saved: sent }));
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const dirty = !same(state.value, state.saved);
  useLeaveGuard(dirty);
  return {
    value: state.value,
    set: (value) => {
      setState((previous) => ({ ...previous, value }));
      if (!mutation.isPending) {
        mutation.reset();
      }
    },
    forgetSaved: () => {
      setState((previous) => ({ ...previous, saved: undefined }));
    },
    dirty,
    saving: mutation.isPending,
    saved: mutation.isSuccess && !dirty,
    error: mutation.error,
    save: () => {
      mutation.mutate(state.value);
    },
    discard: () => {
      setState((previous) => ({ ...previous, value: previous.saved ?? previous.value }));
      mutation.reset();
    },
  };
}
