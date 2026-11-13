// The field types every tracker's fields map to, and how each takes its value: what the shared value input reads.
// Each kind maps its own types (`fieldShape` in `kinds.ts`); browser-safe.

export type TrackerFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'select'
  | 'multi_select'
  | 'labels'
  /** People of the tracker's workspace, by id (Notion's members). */
  | 'people'
  /** Picked from a list the tracker gives (Jira's assignable users, versions, components, sprints). */
  | 'picked'
  /** A status reached through the moves the item offers (Jira's transitions). */
  | 'move';

/** How a field takes its value: its shared type, and what the inputs offer and say about it. */
export type TrackerFieldShape = {
  type: TrackerFieldType;
  /** A choice takes a value outside its options (a new option the tracker creates). */
  newOptions: boolean;
  /** A rule's value may hold variables (not an option picked by its name, nor a person). */
  variables: boolean;
  /** At most one pick (a person, a sprint). */
  single: boolean;
  /** In a rule: what to type, as a placeholder. */
  placeholder: string;
  /** Under the field in a rule, and typed by hand in a tab; null: nothing to add. */
  ruleHint: string | null;
  handHint: string | null;
};

/** A shape with the defaults: typed, variables allowed, nothing to say. */
export function fieldShape(
  type: TrackerFieldType,
  rest: Partial<Omit<TrackerFieldShape, 'type'>> = {},
): TrackerFieldShape {
  return {
    type,
    newOptions: false,
    variables: true,
    single: false,
    placeholder: '{pr.url}',
    ruleHint: null,
    handHint: null,
    ...rest,
  };
}
