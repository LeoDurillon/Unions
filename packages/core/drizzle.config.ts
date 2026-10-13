import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/schema.ts', './src/schema-attachments.ts', './src/schema-refused-commits.ts'],
  out: './drizzle',
  dbCredentials: { url: process.env.DB_PATH ?? '../../union.sqlite' },
});
