import { z } from "zod";
import { eq } from "drizzle-orm";
import { openDatabase, stamp } from "./db.js";
import { users, workspaces, members } from "./schema.js";
import { hashPassword } from "../security/crypto.js";
const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
const password = z.string().min(12).max(128).parse(process.env.ADMIN_PASSWORD);
const { db, sqlite } = await openDatabase();
if (await db.select().from(users).where(eq(users.email, email)).get())
  throw new Error("Administrador já existe; nenhuma senha foi substituída.");
const user = { ...stamp(), email, passwordHash: await hashPassword(password) };
await db.transaction(async (tx) => {
  const workspace = { ...stamp(), name: "Jotage Dev", demo: false };
  await tx.insert(workspaces).values(workspace).run();
  await tx.insert(users).values(user).run();
  await tx
    .insert(members)
    .values({
      ...stamp(),
      userId: user.id,
      workspaceId: workspace.id,
      role: "admin",
    })
    .run();
});
sqlite.close();
console.log("Administrador criado. Use o email e senha definidos no ambiente.");
