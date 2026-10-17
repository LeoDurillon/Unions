// Asks the worker to run a failed GitHub Actions job again, and remembers it was asked until GitHub shows the new run.
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { request } from './api';
import { useEvents } from './use-event-stream';

/** While a re-run was asked, the checks are read this often, so the new run shows. */
const RERUN_POLL_MS = 10_000;
/** After this, a job still shown as failed offers its button again. */
const RERUN_WAIT_MS = 120_000;

export type CiRerun = {
  ask: (checkId: string) => void;
  /** Asked, and GitHub has not shown the new run yet. */
  isAsked: (checkId: string) => boolean;
  /** The check whose request is on its way. */
  sending: string | null;
  error: Error | null;
};

type Asked = ReadonlyMap<string, number>;

function without(asked: Asked, drop: (id: string, at: number) => boolean): Asked {
  return new Map([...asked].filter(([id, at]) => !drop(id, at)));
}

/** The job a failed re-run was about: `run:<job id>`, as the listing names its check. */
function failedRerun(payload: unknown): string | null {
  const jobId =
    typeof payload === 'object' && payload !== null && 'jobId' in payload ? payload.jobId : null;
  return typeof jobId === 'number' ? `run:${jobId}` : null;
}

export function useCiRerun(ticketId: number, refetch: () => unknown): CiRerun {
  const [asked, setAsked] = useState<Asked>(new Map());
  const mutation = useMutation({
    mutationFn: (checkId: string): Promise<unknown> =>
      request('POST', `/api/tickets/${ticketId}/pr-checks/rerun`, { checkId }),
    onSuccess: (_data, checkId) => {
      setAsked((old) => new Map(old).set(checkId, Date.now()));
    },
  });
  // GitHub refused it: the notification says why, the button comes back.
  useEvents((event) => {
    const checkId = event.type === 'ci_job_rerun_failed' ? failedRerun(event.payload) : null;
    if (event.ticketId === ticketId && checkId !== null) {
      setAsked((old) => without(old, (id) => id === checkId));
    }
  });
  useEffect(() => {
    const poll = (): void => {
      void refetch();
      setAsked((old) => without(old, (_id, at) => Date.now() - at > RERUN_WAIT_MS));
    };
    const timer = asked.size === 0 ? null : setInterval(poll, RERUN_POLL_MS);
    return (): void => {
      if (timer !== null) {
        clearInterval(timer);
      }
    };
  }, [asked.size, refetch]);
  return {
    ask: (checkId) => {
      mutation.mutate(checkId);
    },
    isAsked: (checkId) => asked.has(checkId),
    sending: mutation.isPending ? mutation.variables : null,
    error: mutation.error,
  };
}
