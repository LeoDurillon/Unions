import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: [
    './src/schema.ts',
    './src/schema-agent-log.ts',

    './src/schema-attachments.ts',
    './src/schema-ci-outputs.ts',
    './src/schema-container-runs.ts',
    './src/schema-diff-commits.ts',
    './src/schema-events.ts',
    './src/schema-mcp.ts',
    './src/schema-notifications.ts',
    './src/schema-pr-descriptions.ts',
    './src/schema-previews.ts',
    './src/schema-project-files.ts',
    './src/schema-refused-commits.ts',
    './src/schema-review-groupings.ts',
    './src/schema-reviews.ts',
  ],
  out: './drizzle',
  dbCredentials: { url: process.env.DB_PATH ?? '../../union.sqlite' },
});
