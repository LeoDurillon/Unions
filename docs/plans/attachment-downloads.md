# Idea: download attachments from GitHub issues and Notion pages on import

Status: deferred when ticket attachments were built (`f2ee922`). Not started.

Ticket attachments exist: files uploaded in the Overview tab are stored under `attachments/t<ticket>/` and copied to
`/workspace/attachments` before every step. Importing a GitHub issue or a Notion page does not bring the files
attached to it.

Design notes:

- Find the files: images and files linked in the issue body and comments (`user-attachments` URLs), files and images
  blocks of the Notion page.
- Download them with authentication: private-repository files need the project's GitHub credentials (from the web
  server, read only, or the worker); Notion file links expire after about an hour, so download at import time.
- Store them as ticket attachments (private by default, size limits apply: 25 MB per file, 100 MB per ticket) with a
  note saying where they came from.
