// The Union settings pages, in menu order, by group: one page per agent, the models, the tools, the GitHub App.
export const UNION_SETTINGS_GROUPS = [
  { label: 'General', sections: ['shared', 'models'] },
  { label: 'Planning', sections: ['intake', 'summary', 'technical', 'test_plan'] },
  { label: 'Implementation', sections: ['implement', 'final_review'] },
  { label: 'Pull requests', sections: ['pr_description', 'rebase', 'simplify'] },
  { label: 'Review', sections: ['review_comments', 'review_groups'] },
  { label: 'Memory', sections: ['lesson_writer'] },
  { label: 'Tools', sections: ['tools', 'connectors'] },
  { label: 'GitHub', sections: ['github-app'] },
] as const;

/** What `?union=` holds: an agent id, or one of the other pages. */
export type UnionSection = (typeof UNION_SETTINGS_GROUPS)[number]['sections'][number];

const SECTIONS: readonly string[] = UNION_SETTINGS_GROUPS.flatMap(
  (group): readonly string[] => group.sections,
);

export function isUnionSection(value: string | null): value is UnionSection {
  return SECTIONS.some((section) => section === value);
}

/** Where a page comes in the menu, top to bottom. */
export function menuIndex(section: string): number {
  return SECTIONS.indexOf(section);
}
