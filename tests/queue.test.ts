import { it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { workspaces, jobs } from "../apps/api/src/database/schema.js";
import { Queue } from "../apps/api/src/workers/queue.js";
import { AppError } from "../apps/api/src/services/leads.js";
it("pausa quota e limita retentativas com backoff", async () => {
  const { db, sqlite } = await openDatabase(":memory:"),
    workspace = { ...stamp(), name: "Fila" };
  await db.insert(workspaces).values(workspace).run();
  const quota = new Queue(db, async () => {
    throw new AppError(429, "Limite");
  });
  const limited = await quota.enqueue(workspace.id, "analyze", "test");
  await quota.tick();
  expect(
    (await db.select().from(jobs).where(eq(jobs.id, limited.id)).get())?.status,
  ).toBe("paused");
  const retry = new Queue(db, async () => {
    throw new Error("Falha temporária");
  });
  const retried = await retry.enqueue(workspace.id, "audit", "test");
  for (let attempt = 1; attempt <= 3; attempt++) {
    await retry.tick();
    const job = (await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, retried.id))
      .get())!;
    expect(job.attempts).toBe(attempt);
    expect(job.status).toBe(attempt === 3 ? "failed" : "pending");
    expect(job.nextRunAt).toBeGreaterThan(Date.now());
    await db
      .update(jobs)
      .set({ nextRunAt: 0 })
      .where(eq(jobs.id, retried.id))
      .run();
  }
  await quota.stop();
  await retry.stop();
  sqlite.close();
});
