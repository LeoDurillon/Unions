// The user guide as the API serves it: its pages in the guide's order, and one page's text.

/** A page of `documentation/`: its file name without `.md` (`README` for the index) and its title. */
export type GuidePage = { name: string; title: string };

export type GuidePageText = GuidePage & { text: string };
