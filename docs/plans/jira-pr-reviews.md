# Jira issues in reviews of other people's pull requests

Status: planned (2026-11-07). Needs [Jira issues as review specs](jira-review-specs.md) (a review's linked issues are
its `jira` specs, as its linked Notion pages are its `notion` specs). The Jira counterpart of a review's Notion
pages ([a review's Notion page](review-notion-link.md), built).

## Why

**Pull requests → Under review** reviews pull requests Union did not open. For one that implements a Notion page,
the review links the page: the Description tab shows it (and suggests the pages the PR's description links to), a
**Notion** tab shows the page's text and open comments, and Notion rules on "you post a review" set properties of
the page. Teams on Jira name the issue in the pull request instead, by habit: `ABC-123` in the title, the branch
(`feature/ABC-123-dark-mode`) or the description. None of that reaches Union today.

## What the user gets

- The review's **Description** tab lists the Jira issues the pull request names (its title, branch and
  description), each with **Link**; linked issues show with **Unlink**, and **Link a Jira issue** takes a key or
  link by hand.
- A **Jira** tab on the review page, once an issue is linked: each issue's description and comments, read only (as
  the review's Notion tab), with **Open in Jira**.
- The linked issues are specs of the review (Explain, Review with agent, Group by spec read them).
- Jira rules on "you post a review of its pull request" act on the review's linked issues: move them, set their
  fields, comment ("Reviewed: {review.verdict} {review.url}").

## Decisions

- **D1. Linked issues are `jira` specs.** No new table: the review's `review_specs` of kind `jira`, as
  `linkedNotionPages` reads the `notion` ones. Unlinking removes the spec (`removed`), as for Notion.
- **D2. Suggestions from the issue keys the pull request names.** A key is `[A-Z][A-Z0-9_]+-\d+` in the title, the
  head branch or the description, or a `…/browse/KEY` link of the project's site; only keys of the project's Jira
  project are suggested (`projectKey`), so `UTF-8` or `SHA-256` in a description are not. Each suggestion is read
  from Jira before it shows (its summary; one not found is dropped), at most 10.
- **D3. Rules on review events target the review's issues.** `jiraIssueOf` (worker, `jira-target.ts`) takes the
  review's linked issues for a `pr_review_posted` event, else the ticket's origin, as `pagesOf` does for Notion; an
  action on several issues runs on each, its delivery saying how many.
- **D4. The review's Jira tab reads, never writes.** Replying is done in the ticket's Jira tab for Union's own
  tickets; for a review of someone else's pull request, **Open in Jira**. (The review's Notion tab is read only for
  the same reason.)

## Steps

1. **Links.** Core: `linkedJiraIssues`, `linkJiraIssue`, `unlinkJiraIssue` beside the Notion ones in
   `review-specs.ts`. Routes `<review>/jira` (`GET` the issues' text and comments, `POST /check`, `PUT`,
   `DELETE /:key`). Tests with the fake `JiraApi`.
2. **Suggestions.** `jira-keys.ts` (core, pure: keys from a title, a branch, a description; D2) and
   `<review>/jira/suggestions`. Tests on keys among version numbers, links of another site, a key not found.
3. **The review page.** The Description tab's Jira part, the Jira tab. UI check with a stubbed pull request.
4. **Rules.** D3 in the worker; tests: a review event with two linked issues moves both, one with none skips.
5. **Docs.** `documentation/reviewing.md` (Under review, the tabs), `documentation/automation.md` (rules on
   reviews), `docs/architecture/integrations.md`, this plan's status.

## Risks

- **Keys that are not this project's.** D2 keeps only the project's key prefix; a pull request naming an issue of
  another Jira project is linked by hand.
- **Rules acting on someone else's issue.** A review rule moves the issue the pull request names; the user sees the
  linked issues in the Description tab before posting, and the delivery says what it did.
