import { config as dotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

let cursor = dirname(fileURLToPath(import.meta.url));
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
  origin: process.env.APP_ORIGIN || "http://127.0.0.1:5173",
  production: process.env.NODE_ENV === "production",
  secret: process.env.SESSION_SECRET || "",
  database:
    process.env.DATABASE_URL?.replace(/^file:/, "") || "./data/prospect.db",
  overpass:
    process.env.OVERPASS_ENDPOINT || "https://overpass-api.de/api/interpreter",
};
