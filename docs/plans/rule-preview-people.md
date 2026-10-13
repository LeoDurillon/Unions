# Idea: names in the event rule preview for person properties

Status: small, not started.

For a rule setting a Notion person property (for example "Dev"), the rule list shows people's names, but the
"Preview" button shows the raw Notion user ids (`RulePreviewBox` in `apps/web/client/components/settings/rule-preview.tsx`;
the server's `RulePreview.text` is the stored value).

Fix: in the preview, when the property's type is `people`, map the ids through `useNotionUsers` (as `PeopleNames`
does in the rule list), falling back to "unknown member".
