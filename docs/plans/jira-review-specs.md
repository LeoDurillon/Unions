# Jira issues as review specs

Status: planned (2026-11-07). Follows [Jira](jira.md) and [One set of specs per review](review-specs.md), built.
The foundation of [Jira issues in reviews of other people's pull requests](jira-pr-reviews.md).

## Why

The review page's **Specs** bar is what Explain, Review with agent, Group by spec and the spec report read as "what
the change must do". It starts with the ticket's description and, for a ticket from Notion, its Notion page; **Add a
spec** takes the PR's description, the ticket, a GitHub issue or a Notion page. A ticket from Jira only has its
description as copied at import: the issue may have changed since (a reworded acceptance criterion, a comment that
narrowed the scope), and a Jira issue cannot be added as a spec at all.

## What the user gets

- A ticket imported from (or linked to) a Jira issue starts its specs with the ticket's description **and the Jira
  issue**, read from Jira each time, as a Notion page is.
- **Add a spec** has **Jira issue**: a key or link of the project's Jira site. Its spec reads "Jira: ABC-12
  <summary>", its text the issue's description as markdown.
- Every reader of the specs (Explain, Review with agent, Group by spec, the report) gets the issue's text.

## Decisions

- **D1. A spec kind `jira`.** `SPEC_SOURCES` gains `'jira'`; `review_specs.kind` is a text column whose `enum` is
  only TypeScript's (`text('kind', { enum: SPEC_SOURCES })`): no migration. `ref` is the issue key, `url` its link,
  `label` "Jira: KEY summary".
- **D2. Any issue of the site, not only the project.** A review may implement an issue of another Jira project of
  the same site (an epic's story, a shared platform project). The issue is read with the project's token, so the
  account must see it; the site check stays (`jiraRefSiteError`).
- **D3. The issue's text is its description, converted as the import does** (`issueMarkdown`: media matched by name
  or id, attachments listed but not downloaded: a spec is text). Its comments are not part of the spec: they are
  in the Jira tab and, for what matters to the implementer, go through **Add to review**.
- **D4. The starting specs follow the origin.** `startingSpecs` takes the ticket's origin of either kind
  (`trackerOrigin: { kind, id, url }` instead of `notionOrigin`), so a Jira ticket starts with its issue. Lists
  already made keep what they have (`startingSpecs` only adds what a list never had).

## Steps

1. **Core.** `SPEC_SOURCES`, `startingSpecs` (D4), `review-spec-lists.ts`'s labels; tests on the starting list of
   a Jira ticket and on a list made before.
2. **Reading.** `spec-sources.ts`'s `jiraSpec` (D2, D3) beside `notionSpec`; route tests with the fake `JiraApi`:
   an issue of the project, of another project of the site, of another site refused, not visible (404).
3. **The picker.** `review/spec-picker.tsx`: **Jira issue** for projects connected to Jira. UI check: add an issue,
   its label, the spec's text, a Jira ticket's starting specs.
4. **Docs.** `documentation/reviewing.md` (Specs), `docs/spec/pull-requests.md` if it lists the sources, this
   plan's status.

## Risks

- **Large descriptions.** Specs are cut at `MAX_SPEC_CHARS` as any other; a long issue is cut the same way.
