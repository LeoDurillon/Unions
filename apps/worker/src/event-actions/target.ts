// What a kind of rule action needs to be done: one target per kind, picked by the event dispatcher.
import type { ActionKind, ActionOf, DeliveryOutcome, nextDelivery } from '@union/core';

/** A delivery due now, with its rule and the event that triggered it. */
export type Due = NonNullable<ReturnType<typeof nextDelivery>>;

export type ActionTarget<K extends ActionKind> = {
  /** Deliveries done per tick at most: the pace the service it calls allows. */
  perTick: number;
  /** Does the action for the delivery; says why when it cannot, and whether to try again. */
  deliver: (due: Due, action: ActionOf<K>) => Promise<DeliveryOutcome>;
};

export type ActionTargets = { [K in ActionKind]: ActionTarget<K> };

/** Hands the action to the target of its kind. */
export function deliverAction<K extends ActionKind>(
  targets: ActionTargets,
  due: Due,
  action: ActionOf<K>,
): Promise<DeliveryOutcome> {
  return targets[action.kind].deliver(due, action);
}
