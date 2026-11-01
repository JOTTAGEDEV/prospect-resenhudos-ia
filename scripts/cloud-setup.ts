import { eq } from "drizzle-orm";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { users, workspaces, members } from "../apps/api/src/database/schema.js";
import { hashPassword } from "../apps/api/src/security/crypto.js";
const { db, sqlite } = await openDatabase(undefined, true);
if (
  !(await db
    .select()
    .from(users)
    .where(eq(users.email, "admin@jotage.local"))
    .get())
) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8)
    throw new Error(
      "Configure ADMIN_PASSWORD com no mínimo 8 caracteres na Vercel.",
    );
  const user = {
    ...stamp(),
    email: "admin@jotage.local",
    passwordHash: await hashPassword(password),
  };
  const workspace = { ...stamp(), name: "Jotage Dev", demo: false };
  await db.transaction(async (tx) => {
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
}
if ((process.env.SESSION_SECRET?.length || 0) < 32)
  throw new Error("Configure SESSION_SECRET.");
sqlite.close();
console.log("Banco remoto preparado; usuários existentes preservados.");
