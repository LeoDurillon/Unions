// The Union settings pages, in menu order, by group: one page per agent, the models, the tools, the GitHub App.
import { customAgentId, isCustomStep, type CustomStep } from '@union/core/states';

/** The fixed pages; the custom agents' (`agent_<id>`) come after the built-in agents' groups. */
export const UNION_SETTINGS_GROUPS = [
  { label: 'General', sections: ['shared', 'models'] },
  { label: 'Planning', sections: ['intake', 'summary', 'technical', 'test_plan'] },
  { label: 'Implementation', sections: ['implement', 'final_review'] },
  {
    label: 'Pull requests',
    sections: ['pr_description', 'pr_replies', 'rebase', 'simplify', 'split_plan', 'split'],
  },
  {
    label: 'Review',
    sections: ['review_comments', 'review_groups', 'review_explain', 'review_report'],
  },
  { label: 'Memory', sections: ['lesson_writer'] },
  { label: 'Tools', sections: ['tools', 'connectors'] },
  { label: 'GitHub', sections: ['github-app'] },
] as const;

/** What `?union=` holds: an agent id (a custom agent's too), or one of the other pages. */
export type UnionSection = (typeof UNION_SETTINGS_GROUPS)[number]['sections'][number] | CustomStep;

const SECTIONS: readonly string[] = UNION_SETTINGS_GROUPS.flatMap(
  (group): readonly string[] => group.sections,
);

/** A fixed page, or a custom agent's (whether it exists is the page's to say). */
export function isUnionSection(value: string | null): value is UnionSection {
  return isCustomStep(value) || SECTIONS.some((section) => section === value);
}

/** Where a page comes in the menu, top to bottom: custom agents after the built-in ones, oldest first. */
export function menuIndex(section: string): number {
  return isCustomStep(section)
    ? SECTIONS.length + customAgentId(section)
    : SECTIONS.indexOf(section);
}
