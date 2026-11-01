import { QueueClient } from "@vercel/queue";
import { eq, and, lt } from "drizzle-orm";
import { z } from "zod";
import { jobs } from "../apps/api/src/database/schema.js";
import { getServer } from "../apps/api/src/serverless.js";
import { WORKER_LEASE_SECONDS } from "../apps/api/src/config.js";
const client = new QueueClient();
class ContinueScreening extends Error {
  constructor(public delaySeconds: number) {
    super("Continuar verificação");
  }
}
export default client.handleNodeCallback(
  async (input: unknown) => {
    const { id } = z.object({ id: z.uuid() }).parse(input);
    const { db, queue } = await getServer();
    await db
      .update(jobs)
      .set({ status: "pending" })
      .where(
        and(
          eq(jobs.id, id),
          eq(jobs.status, "running"),
          lt(
            jobs.updatedAt,
            new Date(Date.now() - WORKER_LEASE_SECONDS * 1000).toISOString(),
          ),
        ),
      )
      .run();
    await queue.tick(id);
    const job = await db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (job?.status === "pending" && job.attempts === 0)
      throw new ContinueScreening(
        Math.max(1, Math.ceil((job.nextRunAt - Date.now()) / 1000)),
      );
    if (job && ["pending", "running"].includes(job.status))
      throw new Error("Tarefa aguardando retentativa");
  },
  {
    visibilityTimeoutSeconds: WORKER_LEASE_SECONDS,
    retry: (error) => ({
      afterSeconds:
        error instanceof ContinueScreening ? error.delaySeconds : 60,
    }),
  },
);
