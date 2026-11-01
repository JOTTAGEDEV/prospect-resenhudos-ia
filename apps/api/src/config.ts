import { config as dotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
let cursor = process.env.VERCEL
  ? process.cwd()
  : dirname(fileURLToPath(import.meta.url));
while (!existsSync(resolve(cursor, "packages/shared/package.json"))) {
  const parent = dirname(cursor);
  if (parent === cursor)
    throw new Error("Raiz do monorepositório não encontrada");
  cursor = parent;
}
export const root = cursor;
dotenv({ path: resolve(root, ".env"), quiet: true });
export const config = {
  port: Number(process.env.PORT || 3001),
  origin: process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_ORIGIN || "http://127.0.0.1:5173",
  production: process.env.NODE_ENV === "production",
  secret: process.env.SESSION_SECRET || "",
  database:
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "./data/prospect.db",
  overpass:
    process.env.OVERPASS_ENDPOINT ||
    "https://overpass.private.coffee/api/interpreter",
};

export const allowedOrigins = new Set(
  [
    config.origin,
    process.env.APP_ORIGIN,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
  ].filter(Boolean),
);

export const TASK_TIMEOUT_MS = 285000;
export const WORKER_LEASE_SECONDS = 300;
export const GEMINI_TIMEOUT_MS = 270000;
