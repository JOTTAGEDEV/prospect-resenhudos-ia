import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
const envPath = resolve(".env");
if (!existsSync(envPath)) {
  const template = readFileSync(".env.example", "utf8").replace(
    "SESSION_SECRET=",
    "SESSION_SECRET=" + randomBytes(48).toString("base64url"),
  );
  writeFileSync(envPath, template, { mode: 0o600, flag: "wx" });
}
const { openDatabase, stamp } = await import("../apps/api/src/database/db.js");
const { users, workspaces, members } =
  await import("../apps/api/src/database/schema.js");
const { hashPassword } = await import("../apps/api/src/security/crypto.js");
const { db, sqlite } = openDatabase();
if (!db.select().from(users).get()) {
  const email = process.env.ADMIN_EMAIL || "admin@jotage.local";
  const password =
    process.env.ADMIN_PASSWORD || randomBytes(18).toString("base64url");
  if (password.length < 12)
    throw new Error("A senha precisa ter pelo menos 12 caracteres.");
  const user = {
      ...stamp(),
      email,
      passwordHash: await hashPassword(password),
    },
    workspace = { ...stamp(), name: "Jotage Dev", demo: false };
  db.transaction((tx) => {
    tx.insert(workspaces).values(workspace).run();
    tx.insert(users).values(user).run();
    tx.insert(members)
      .values({
        ...stamp(),
        workspaceId: workspace.id,
        userId: user.id,
        role: "admin",
      })
      .run();
  });
  mkdirSync(".local", { recursive: true });
  writeFileSync(
    ".local/first-access.json",
    JSON.stringify({ email, password }, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Administrador criado. O acesso inicial está somente em .local/first-access.json, ignorado pelo Git. Use npm run access no seu terminal para visualizar e altere a senha após entrar.",
  );
} else console.log("Ambiente já configurado; usuários e senhas preservados.");
sqlite.close();
