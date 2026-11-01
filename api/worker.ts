import { QueueClient } from "@vercel/queue";
import { eq, and, lt } from "drizzle-orm";
import { z } from "zod";
import { jobs } from "../apps/api/src/database/schema.js";
import { getServer } from "../apps/api/src/serverless.js";
const client = new QueueClient();
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
          lt(jobs.updatedAt, new Date(Date.now() - 120000).toISOString()),
        ),
      )
      .run();
    await queue.tick(id);
    const job = await db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (job && ["pending", "running"].includes(job.status))
      throw new Error("Tarefa aguardando retentativa");
  },
  { visibilityTimeoutSeconds: 120, retry: () => ({ afterSeconds: 60 }) },
);
