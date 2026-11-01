import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { config, root } from "../config.js";
import * as schema from "./schema.js";
export async function openDatabase(
  path = config.database,
  migrateOnOpen = !process.env.VERCEL,
) {
  const remote = /^(libsql|https):\/\//.test(path);
  if (process.env.VERCEL && !remote)
    throw new Error("Configure TURSO_DATABASE_URL na Vercel.");
  const filename =
    path === ":memory:"
      ? ":memory:"
      : resolve(root, path.replace(/^file:/, ""));
  if (!remote && filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const { createClient } = remote
    ? await import("@libsql/client/web")
    : await import("@libsql/client");
  const sqlite = createClient({
    url: remote
      ? path
      : filename === ":memory:"
        ? "file::memory:"
        : pathToFileURL(filename).href,
    authToken: remote ? process.env.TURSO_AUTH_TOKEN : undefined,
  });
  const db = drizzle(sqlite, { schema });
  if (!remote) {
    await sqlite.execute("PRAGMA foreign_keys = ON");
    await sqlite.execute("PRAGMA busy_timeout = 5000");
  }
  if (migrateOnOpen)
    await migrate(db, { migrationsFolder: resolve(root, "apps/api/drizzle") });
  return { db, sqlite };
}
export type DB = Pick<
  Awaited<ReturnType<typeof openDatabase>>["db"],
  "select" | "insert" | "update" | "delete" | "transaction"
>;
export const stamp = () => {
  const now = new Date().toISOString();
  return { id: randomUUID(), createdAt: now, updatedAt: now };
};
