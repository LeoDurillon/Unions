// What the API answers about the size of a ticket's change: its lines of code against its budget.
import type { ChangeBudget, ChangeSize } from '@union/core';

/** `trimmedFrom`: the lines of code before the trim pass, when the last implementation had one. */
export type TicketSize = ChangeSize & { budget: ChangeBudget | null; trimmedFrom: number | null };
