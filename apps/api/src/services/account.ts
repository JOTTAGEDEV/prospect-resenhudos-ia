import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { type DB, stamp } from "../database/db.js";
import * as s from "../database/schema.js";
import type { Queue } from "../workers/queue.js";
import { AppError } from "./leads.js";
import { getSettings, updateSettings } from "./settings.js";

export const profileInput = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        "Use letras, números, ponto, hífen ou sublinhado",
      )
      .transform((value) => value.toLowerCase()),
    displayName: z.string().trim().min(2).max(100),
    company: z.string().trim().min(2).max(100),
  })
  .strict();

export async function findLoginUser(db: DB, value: string) {
  const login = value.trim().toLowerCase();
  const named = await db
    .select()
    .from(s.users)
    .where(eq(s.users.username, login))
    .get();
  if (named) return named;
  if (login === "admin123")
    return db
      .select()
      .from(s.users)
      .where(
        and(eq(s.users.email, "admin@jotage.local"), isNull(s.users.username)),
      )
      .get();
  return db.select().from(s.users).where(eq(s.users.email, login)).get();
}

export async function publicAccount(db: DB, userId: string) {
  const user = await db
    .select()
    .from(s.users)
    .where(eq(s.users.id, userId))
    .get();
  if (!user) throw new AppError(401, "Sessão inválida");
  return {
    username:
      user.username ||
      (user.email === "admin@jotage.local" ? "admin123" : user.email),
    displayName: user.displayName || "Jotage Dev",
  };
}

async function assertAdmin(db: DB, userId: string, workspaceId: string) {
  const member = await db
    .select()
    .from(s.members)
    .where(
      and(eq(s.members.userId, userId), eq(s.members.workspaceId, workspaceId)),
    )
    .get();
  if (member?.role !== "admin")
    throw new AppError(
      403,
      "Somente administradores podem alterar a conta e limpar o workspace.",
    );
}

export async function updateProfile(
  db: DB,
  userId: string,
  workspaceId: string,
  body: unknown,
) {
  const input = profileInput.parse(body);
  await assertAdmin(db, userId, workspaceId);
  await db.transaction(async (tx) => {
    const duplicate = await tx
      .select({ id: s.users.id })
      .from(s.users)
      .where(and(eq(s.users.username, input.username), ne(s.users.id, userId)))
      .get();
    if (duplicate) throw new AppError(409, "Este usuário já está em uso.");
    const now = new Date().toISOString();
    await tx
      .update(s.users)
      .set({
        username: input.username,
        displayName: input.displayName,
        updatedAt: now,
      })
      .where(eq(s.users.id, userId))
      .run();
    await tx
      .update(s.workspaces)
      .set({ name: input.company, updatedAt: now })
      .where(eq(s.workspaces.id, workspaceId))
      .run();
    const settings = await getSettings(tx, workspaceId);
    await updateSettings(tx, workspaceId, {
      ...settings,
      company: input.company,
    });
    await tx
      .insert(s.logs)
      .values({
        ...stamp(),
        workspaceId,
        action: "account.profile.updated",
        targetId: userId,
      })
      .run();
  });
  return { ...(await publicAccount(db, userId)), company: input.company };
}

export async function resetWorkspace(
  db: DB,
  queue: Pick<Queue, "cancel">,
  userId: string,
  workspaceId: string,
  body: unknown,
) {
  z.object({ confirmation: z.literal("APAGAR LEADS E HISTORICOS") })
    .strict()
    .parse(body);
  await assertAdmin(db, userId, workspaceId);
  const active = await db
    .select({ id: s.jobs.id })
    .from(s.jobs)
    .where(
      and(
        eq(s.jobs.workspaceId, workspaceId),
        inArray(s.jobs.status, ["pending", "running", "paused"]),
      ),
    )
    .all();
  for (const job of active) {
    try {
      await queue.cancel(workspaceId, job.id);
    } catch (error) {
      if (!(error instanceof AppError && error.statusCode === 409)) throw error;
    }
  }
  return db.transaction(async (tx) => {
    const leadCount = (
      await tx
        .select({ id: s.leads.id })
        .from(s.leads)
        .where(eq(s.leads.workspaceId, workspaceId))
        .all()
    ).length;
    const searchCount = (
      await tx
        .select({ id: s.searches.id })
        .from(s.searches)
        .where(eq(s.searches.workspaceId, workspaceId))
        .all()
    ).length;
    // Each table is scoped explicitly, including children, without relying on FK settings.
    await tx.delete(s.jobs).where(eq(s.jobs.workspaceId, workspaceId)).run();
    await tx
      .delete(s.results)
      .where(eq(s.results.workspaceId, workspaceId))
      .run();
    await tx
      .delete(s.sources)
      .where(eq(s.sources.workspaceId, workspaceId))
      .run();
    await tx
      .delete(s.audits)
      .where(eq(s.audits.workspaceId, workspaceId))
      .run();
    await tx
      .delete(s.analyses)
      .where(eq(s.analyses.workspaceId, workspaceId))
      .run();
    await tx
      .delete(s.scores)
      .where(eq(s.scores.workspaceId, workspaceId))
      .run();
    await tx
      .delete(s.messages)
      .where(eq(s.messages.workspaceId, workspaceId))
      .run();
    await tx
      .delete(s.activities)
      .where(eq(s.activities.workspaceId, workspaceId))
      .run();
    await tx.delete(s.tasks).where(eq(s.tasks.workspaceId, workspaceId)).run();
    await tx.delete(s.leads).where(eq(s.leads.workspaceId, workspaceId)).run();
    await tx
      .delete(s.searches)
      .where(eq(s.searches.workspaceId, workspaceId))
      .run();
    await tx.delete(s.logs).where(eq(s.logs.workspaceId, workspaceId)).run();
    return { ok: true, deletedLeads: leadCount, deletedSearches: searchCount };
  });
}

export function registerAccountRoutes(
  app: FastifyInstance,
  db: DB,
  queue: Queue,
) {
  app.patch("/api/account/profile", async (request) =>
    updateProfile(
      db,
      request.auth.userId,
      request.auth.workspaceId,
      request.body,
    ),
  );
  app.post("/api/account/reset", async (request) =>
    resetWorkspace(
      db,
      queue,
      request.auth.userId,
      request.auth.workspaceId,
      request.body,
    ),
  );
}
