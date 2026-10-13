# Idea: Events v2

Status: ideas left out of Events v1 (`9bfae3b`). Not started.

Events v1: rules on a project, triggered by ticket events, setting one property of the ticket's Notion page (tickets
imported from Notion only), applied to events logged after the rule's creation.

Left for later:

- **Replay:** apply a new rule to past events (with a preview of what it would change, and a cap).
- **More actions:** other targets than a Notion property (a comment on the Notion page, a GitHub label or comment, a
  webhook, …).
- **Filters:** conditions on a rule (for example only tickets with a label, or only some board columns).
- **Group triggers** once [ticket groups](ticket-groups.md) exist: "every PR of the group is merged".
- **Person properties from variables:** today a person property takes fixed people; mapping a GitHub user to a Notion
  user would allow "whoever opened the PR".
