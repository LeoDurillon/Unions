import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: [
    './src/schema.ts',
    './src/schema-agent-log.ts',
    './src/schema-agent-usage.ts',

    './src/schema-attachments.ts',
    './src/schema-ci-outputs.ts',
    './src/schema-container-runs.ts',
    './src/schema-custom-agents.ts',
    './src/schema-diff-commits.ts',
    './src/schema-events.ts',
    './src/schema-integrations.ts',
    './src/schema-lesson-suggestions.ts',
    './src/schema-mcp.ts',
    './src/schema-notifications.ts',
    './src/schema-pr-descriptions.ts',
    './src/schema-previews.ts',
    './src/schema-project-files.ts',
    './src/schema-refused-commits.ts',
    './src/schema-review-explanations.ts',
    './src/schema-review-groupings.ts',
    './src/schema-review-reports.ts',
    './src/schema-review-specs.ts',
    './src/schema-reviews.ts',
    './src/schema-ticket-slices.ts',
    './src/schema-union-update.ts',
  ],
  out: './drizzle',
  dbCredentials: { url: process.env.DB_PATH ?? '../../union.sqlite' },
});
