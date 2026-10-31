import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, root } from '../config.js';
import * as schema from './schema.js';

export function openDatabase(path = config.database) {
  const filename = path === ':memory:' ? path : resolve(root,path);
  if (filename !== ':memory:') mkdirSync(dirname(filename),{recursive:true});
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite,{schema});
  migrate(db,{migrationsFolder:resolve(root,'apps/api/drizzle')});
  return {db,sqlite};
}
export type DB = ReturnType<typeof openDatabase>['db'];
export const stamp = () => {const now = new Date().toISOString();return {id:randomUUID(),createdAt:now,updatedAt:now};};
