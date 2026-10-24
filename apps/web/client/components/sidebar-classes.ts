// Classes the sidebar's entries use to fold into its icon rail (`data-compact` on the sidebar).

/** A label: read by screen readers only while folded. */
export const SIDE_LABEL = 'truncate group-data-[compact]/side:sr-only';
/** Shown only while folded (a project's initial). */
export const RAIL_ONLY = 'hidden group-data-[compact]/side:inline';
/** An entry: its icon centred while folded. */
export const SIDE_ITEM =
  'relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition group-data-[compact]/side:justify-center group-data-[compact]/side:px-0';
/** A count: pinned to the icon's corner while folded. */
export const SIDE_BADGE =
  'ml-auto rounded-full px-1.5 text-xs font-semibold text-white group-data-[compact]/side:absolute group-data-[compact]/side:top-0 group-data-[compact]/side:right-0.5 group-data-[compact]/side:ml-0 group-data-[compact]/side:px-1 group-data-[compact]/side:text-[10px]';
