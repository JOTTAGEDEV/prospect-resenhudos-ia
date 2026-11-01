import { openDatabase } from "./database/db.js";
import { buildApp } from "./app.js";
let instance: ReturnType<typeof initialize> | undefined;
async function initialize() {
  if ((process.env.SESSION_SECRET?.length || 0) < 32)
    throw new Error("SESSION_SECRET ausente");
  const { db } = await openDatabase(undefined, false);
  const built = await buildApp(db, { worker: false });
  await built.app.ready();
  return { ...built, db };
}
export function getServer() {
  return (instance ||= initialize().catch((error) => {
    instance = undefined;
    throw error;
  }));
}
