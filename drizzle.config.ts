import { defineConfig } from 'drizzle-kit';
export default defineConfig({schema:'./apps/api/src/database/schema.ts',out:'./apps/api/drizzle',dialect:'sqlite'});
