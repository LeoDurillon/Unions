// The hook that sends commands for a ticket and refreshes what the page shows afterwards.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Step } from '@union/core';

import type { CommandType } from '../../src/api-types';
import { api, type CommandExtra } from './api';

type CommandInput = CommandExtra & { type: CommandType };
type EditInput = { step: Step; content: string };
/** A command, optionally preceded by saving an edited output (for example typed answers). */
type ActInput = CommandInput & { saveFirst?: EditInput };

export function useTicketCommands(ticketId: number): {
  command: UseMutationResult<unknown, Error, CommandInput>;
  edit: UseMutationResult<unknown, Error, EditInput>;
  act: UseMutationResult<unknown, Error, ActInput>;
} {
  const queryClient = useQueryClient();
  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
    ]);
  };
  const command = useMutation({
    mutationFn: ({ type, ...extra }: CommandInput) => api.command(ticketId, type, extra),
    onSettled: refresh,
  });
  const edit = useMutation({
    mutationFn: (input: EditInput) => api.editOutput(ticketId, input.step, input.content),
    onSettled: refresh,
  });
  const act = useMutation({
    mutationFn: async (input: ActInput) => {
      if (input.saveFirst) {
        await api.editOutput(ticketId, input.saveFirst.step, input.saveFirst.content);
      }
      return api.command(ticketId, input.type, { feedback: input.feedback });
    },
    onSettled: refresh,
  });
  return { command, edit, act };
}
