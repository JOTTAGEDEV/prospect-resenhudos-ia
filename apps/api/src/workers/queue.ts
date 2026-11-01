import { and, eq, inArray, lte, asc } from "drizzle-orm";
import { type DB, stamp } from "../database/db.js";
import { jobs } from "../database/schema.js";
import { TASK_TIMEOUT_MS } from "../config.js";
import { AppError } from "../services/leads.js";
export type Job = typeof jobs.$inferSelect;
export type Handler = (
  job: Job,
  signal: AbortSignal,
  progress: (value: number) => void,
) => Promise<unknown>;
export class Queue {
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private aborts = new Map<string, AbortController>();
  constructor(
    private db: DB,
    private handler: Handler,
  ) {}
  async enqueue(workspaceId: string, kind: string, targetId: string) {
    const existing = await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.kind, kind),
          eq(jobs.targetId, targetId),
          inArray(jobs.status, ["pending", "running", "paused"]),
        ),
      )
      .get();
    if (existing) return existing;
    return await this.db
      .insert(jobs)
      .values({ ...stamp(), workspaceId, kind, targetId, status: "pending" })
      .returning()
      .get();
  }
  async start() {
    // Single API process owns the worker; uncompleted jobs recover after a restart.
    await this.db
      .update(jobs)
      .set({ status: "pending", error: "Retomada após reinicialização" })
      .where(eq(jobs.status, "running"))
      .run();
    this.timer = setInterval(() => void this.tick(), 1000);
    this.timer.unref();
  }
  async tick(id?: string) {
    if (this.running) return;
    this.running = true;
    try {
      const job = await this.db.transaction(async (tx) => {
        const next = await tx
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.status, "pending"),
              lte(jobs.nextRunAt, Date.now()),
              id ? eq(jobs.id, id) : undefined,
            ),
          )
          .orderBy(asc(jobs.createdAt))
          .get();
        if (!next) return undefined;
        if (next.attempts >= 3) {
          await tx
            .update(jobs)
            .set({ status: "failed", error: "Limite de tentativas atingido" })
            .where(eq(jobs.id, next.id))
            .run();
          return undefined;
        }
        return await tx
          .update(jobs)
          .set({
            status: "running",
            attempts: next.attempts + 1,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(jobs.id, next.id), eq(jobs.status, "pending")))
          .returning()
          .get();
      });
      if (!job) return;
      const controller = new AbortController();
      this.aborts.set(job.id, controller);
      const timeout = setTimeout(
        () => controller.abort(new Error("Tempo máximo da tarefa excedido")),
        TASK_TIMEOUT_MS,
      );
      try {
        const result = await this.handler(
          job,
          controller.signal,
          async (value) =>
            await this.db
              .update(jobs)
              .set({ progress: value, updatedAt: new Date().toISOString() })
              .where(and(eq(jobs.id, job.id), eq(jobs.status, "running")))
              .run(),
        );
        if (!controller.signal.aborted)
          await this.db
            .update(jobs)
            .set({
              status: "completed",
              progress: 100,
              result,
              error: null,
              finishedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
            .where(and(eq(jobs.id, job.id), eq(jobs.status, "running")))
            .run();
        else throw controller.signal.reason;
      } catch (error) {
        const current = await this.db
          .select()
          .from(jobs)
          .where(eq(jobs.id, job.id))
          .get();
        if (current?.status !== "cancelled") {
          const quota = error instanceof AppError && error.statusCode === 429;
          const permanent =
            error instanceof AppError &&
            [400, 404, 409, 422].includes(error.statusCode);
          await this.db
            .update(jobs)
            .set({
              status: quota
                ? "paused"
                : permanent || job.attempts >= 3
                  ? "failed"
                  : "pending",
              error: error instanceof Error ? error.message : "Falha na tarefa",
              nextRunAt: Date.now() + 30000 * 2 ** job.attempts,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(jobs.id, job.id))
            .run();
        }
      } finally {
        clearTimeout(timeout);
        this.aborts.delete(job.id);
      }
    } finally {
      this.running = false;
    }
  }
  async cancel(workspaceId: string, id: string) {
    const changed = await this.db
      .update(jobs)
      .set({
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(jobs.id, id),
          eq(jobs.workspaceId, workspaceId),
          inArray(jobs.status, ["pending", "running", "paused"]),
        ),
      )
      .returning()
      .get();
    if (!changed)
      throw new AppError(409, "Tarefa não disponível para cancelamento");
    this.aborts.get(id)?.abort();
    return changed;
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    for (const abort of this.aborts.values()) abort.abort();
    while (this.running) await new Promise((r) => setTimeout(r, 25));
  }
}
