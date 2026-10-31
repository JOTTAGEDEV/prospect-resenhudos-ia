import { config } from "./config.js";
import { openDatabase } from "./database/db.js";
import { buildApp } from "./app.js";
if (config.secret.length < 32)
  throw new Error("Defina SESSION_SECRET com pelo menos 32 caracteres no .env");
const { db, sqlite } = openDatabase();
const { app } = await buildApp(db, { logger: true });
await app.listen({ port: config.port, host: "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close().then(() => {
      sqlite.close();
      process.exit(0);
    });
  });
