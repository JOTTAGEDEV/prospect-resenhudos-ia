import Fastify, { type FastifyRequest } from "fastify";
import { send } from "@vercel/queue";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  leadInput,
  searchInput,
  settingsInput,
  stageSchema,
  stages,
} from "../../../packages/shared/src/index.js";
import { type DB, stamp } from "./database/db.js";
import * as s from "./database/schema.js";
import { config, root, allowedOrigins } from "./config.js";
import { digest, verifyPassword, hashPassword } from "./security/crypto.js";
import {
  AppError,
  getLead,
  saveLead,
  scoreLead,
  contacts,
  assertContactAllowed,
  whatsappLink,
  normalizePhone,
} from "./services/leads.js";
import { getSettings, updateSettings, getApiKey } from "./services/settings.js";
import { Queue } from "./workers/queue.js";
import { createHandler } from "./services/job-handler.js";
import {
  OverpassProvider,
  type BusinessSearchProvider,
} from "./providers/overpass.js";
import { WebsiteAuditor, type WebsiteAuditService } from "./services/audit.js";
import { GeminiProvider, type AIProvider } from "./providers/gemini.js";
type Auth = {
  userId: string;
  workspaceId: string;
  email: string;
};
declare module "fastify" {
  interface FastifyRequest {
    auth: Auth;
  }
}
const idOf = (request: FastifyRequest) =>
  z.object({ id: z.uuid() }).parse(request.params).id;
export async function buildApp(
  db: DB,
  options: {
    search?: BusinessSearchProvider;
    auditor?: WebsiteAuditService;
    ai?: AIProvider;
    worker?: boolean;
    logger?: boolean;
  } = {},
) {
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "res.headers.set-cookie",
          ],
          level: "info",
        }
      : false,
    bodyLimit: 1000000,
  });
  if (process.env.VERCEL)
    app.addHook("preSerialization", async (request, reply, payload) => {
      if (request.auth?.workspaceId && reply.statusCode < 400) {
        const pending = await db
          .select()
          .from(s.jobs)
          .where(
            and(
              eq(s.jobs.workspaceId, request.auth.workspaceId),
              eq(s.jobs.status, "pending"),
            ),
          )
          .limit(20)
          .all();
        for (const job of pending)
          await send(
            "prospect-jobs",
            { id: job.id },
            {
              idempotencyKey: `${job.id}-${job.attempts}-${job.nextRunAt}`,
              retentionSeconds: 604800,
            },
          );
      }
      return payload;
    });
  const ai = options.ai || new GeminiProvider(db);
  const queue = new Queue(
    db,
    createHandler(
      db,
      options.search || new OverpassProvider(),
      options.auditor || new WebsiteAuditor(),
      ai,
    ),
  );
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: (request) => !request.url.startsWith("/api/"),
  });
  const dummyHash = await hashPassword(randomBytes(24).toString("hex"));
  app.decorateRequest("auth");
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: "Dados inválidos",
        details: error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    const status =
      error instanceof AppError
        ? error.statusCode
        : (
            error as {
              statusCode?: number;
            }
          ).statusCode || 500;
    if (status >= 500)
      app.log.error({ code: status }, "Falha ao processar solicitação");
    return reply.code(status).send({
      error:
        status === 500
          ? "Erro interno. Consulte o log e tente novamente."
          : error instanceof Error
            ? error.message
            : "Falha na solicitação",
    });
  });
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.headers.origin && !allowedOrigins.has(request.headers.origin))
        throw new AppError(403, "Origem não permitida");
      if (request.headers["x-requested-with"] !== "JotageProspect")
        throw new AppError(403, "Cabeçalho de proteção obrigatório");
      if (request.headers["sec-fetch-site"] === "cross-site")
        throw new AppError(403, "Solicitação entre sites bloqueada");
    }
    if (
      request.url.split("?")[0] === "/api/health" ||
      request.url === "/api/auth/login"
    )
      return;
    const token = request.cookies.session;
    const session = token
      ? await db
          .select()
          .from(s.sessions)
          .where(eq(s.sessions.id, digest(token)))
          .get()
      : undefined;
    if (!session || session.expiresAt < Date.now())
      throw new AppError(401, "Faça login para continuar");
    const member = await db
      .select()
      .from(s.members)
      .where(
        and(
          eq(s.members.userId, session.userId),
          eq(s.members.workspaceId, session.workspaceId),
        ),
      )
      .get();
    const user = await db
      .select()
      .from(s.users)
      .where(eq(s.users.id, session.userId))
      .get();
    if (!member || !user) throw new AppError(401, "Sessão inválida");
    request.auth = {
      userId: user.id,
      email: user.email,
      workspaceId: session.workspaceId,
    };
  });
  app.get("/api/health", () => ({ status: "ok", version: "0.1.0" }));
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = z
        .object({
          username: z.string().trim().min(1).max(254).optional(),
          email: z.email().max(254).optional(),
          password: z.string().min(1).max(128),
        })
        .strict()
        .refine(
          (value) => !!(value.username || value.email),
          "Informe o usuário",
        )
        .parse(request.body);
      const login = (input.username || input.email || "").toLowerCase();
      const user = await db
        .select()
        .from(s.users)
        .where(
          eq(
            s.users.email,
            login === "admin123" ? "admin@jotage.local" : login,
          ),
        )
        .get();
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash || dummyHash,
      );
      if (!valid || !user)
        throw new AppError(401, "Usuário ou senha inválidos");
      const member = await db
        .select()
        .from(s.members)
        .where(eq(s.members.userId, user.id))
        .get();
      if (!member) throw new AppError(403, "Usuário sem workspace");
      const token = randomBytes(32).toString("base64url");
      if (request.cookies.session)
        await db
          .delete(s.sessions)
          .where(eq(s.sessions.id, digest(request.cookies.session)))
          .run();
      await db
        .insert(s.sessions)
        .values({
          id: digest(token),
          userId: user.id,
          workspaceId: member.workspaceId,
          expiresAt: Date.now() + 8 * 60 * 60 * 1000,
        })
        .run();
      reply.setCookie("session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: config.production,
        path: "/",
        maxAge: 8 * 60 * 60,
      });
      return { email: user.email, workspaceId: member.workspaceId };
    },
  );
  app.post("/api/auth/logout", async (request, reply) => {
    if (request.cookies.session)
      await db
        .delete(s.sessions)
        .where(eq(s.sessions.id, digest(request.cookies.session)))
        .run();
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.post(
    "/api/auth/password",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request) => {
      const input = z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: z.string().min(12).max(128),
        })
        .strict()
        .parse(request.body);
      const user = (await db
        .select()
        .from(s.users)
        .where(eq(s.users.id, request.auth.userId))
        .get())!;
      if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
        throw new AppError(401, "Senha atual incorreta");
      const passwordHash = await hashPassword(input.newPassword);
      await db.transaction(async (tx) => {
        await tx
          .update(s.users)
          .set({ passwordHash, updatedAt: new Date().toISOString() })
          .where(eq(s.users.id, user.id))
          .run();
        const sessions = await tx
          .select()
          .from(s.sessions)
          .where(eq(s.sessions.userId, user.id))
          .all();
        const current = digest(request.cookies.session!);
        for (const session of sessions)
          if (session.id !== current)
            await tx
              .delete(s.sessions)
              .where(eq(s.sessions.id, session.id))
              .run();
        await tx
          .insert(s.logs)
          .values({
            ...stamp(),
            workspaceId: request.auth.workspaceId,
            action: "password.changed",
            targetId: user.id,
          })
          .run();
      });
      return { ok: true };
    },
  );
  app.get("/api/auth/me", async (request) => ({
    ...request.auth,
    workspaces: await db
      .select({
        id: s.workspaces.id,
        name: s.workspaces.name,
        demo: s.workspaces.demo,
      })
      .from(s.members)
      .innerJoin(s.workspaces, eq(s.members.workspaceId, s.workspaces.id))
      .where(eq(s.members.userId, request.auth.userId))
      .all(),
  }));
  app.post("/api/auth/workspace", async (request) => {
    const { workspaceId } = z
      .object({ workspaceId: z.uuid() })
      .parse(request.body);
    if (
      !(await db
        .select()
        .from(s.members)
        .where(
          and(
            eq(s.members.userId, request.auth.userId),
            eq(s.members.workspaceId, workspaceId),
          ),
        )
        .get())
    )
      throw new AppError(403, "Workspace não autorizado");
    await db
      .update(s.sessions)
      .set({ workspaceId })
      .where(eq(s.sessions.id, digest(request.cookies.session!)))
      .run();
    return { ok: true };
  });
  const filtered = async (request: FastifyRequest) => {
    const query = z
      .object({
        q: z.string().max(200).optional(),
        category: z.string().optional(),
        stage: stageSchema.optional(),
        city: z.string().optional(),
        source: z.string().optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        minScore: z.coerce.number().min(0).max(100).optional(),
        sort: z.enum(["createdAt", "name", "score"]).default("createdAt"),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query);
    let rows = await db
      .select()
      .from(s.leads)
      .where(eq(s.leads.workspaceId, request.auth.workspaceId))
      .orderBy(desc(s.leads.createdAt))
      .all();
    rows = rows.filter(
      (l) =>
        (!query.q ||
          `${l.name} ${l.city || ""} ${l.tags.join(" ")}`
            .toLowerCase()
            .includes(query.q.toLowerCase())) &&
        (!query.category || l.category === query.category) &&
        (!query.stage || l.stage === query.stage) &&
        (!query.city || l.city === query.city) &&
        (!query.source || l.source === query.source) &&
        (!query.from || l.createdAt.slice(0, 10) >= query.from) &&
        (!query.to || l.createdAt.slice(0, 10) <= query.to) &&
        (query.minScore === undefined ||
          (l.score !== null && l.score >= query.minScore)),
    );
    if (query.sort === "name")
      rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (query.sort === "score")
      rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return { rows, query };
  };
  app.get("/api/leads", async (request) => {
    const { rows, query } = await filtered(request);
    return {
      items: rows.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  });
  app.post(
    "/api/leads",
    async (request) =>
      await saveLead(
        db,
        request.auth.workspaceId,
        leadInput.parse(request.body),
      ),
  );
  app.get("/api/leads/:id", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request),
      lead = await getLead(db, ws, id);
    return {
      lead,
      sources: await db
        .select()
        .from(s.sources)
        .where(and(eq(s.sources.workspaceId, ws), eq(s.sources.leadId, id)))
        .all(),
      audits: await db
        .select()
        .from(s.audits)
        .where(and(eq(s.audits.workspaceId, ws), eq(s.audits.leadId, id)))
        .orderBy(desc(s.audits.createdAt))
        .all(),
      analyses: await db
        .select()
        .from(s.analyses)
        .where(and(eq(s.analyses.workspaceId, ws), eq(s.analyses.leadId, id)))
        .orderBy(desc(s.analyses.createdAt))
        .all(),
      activities: await db
        .select()
        .from(s.activities)
        .where(
          and(eq(s.activities.workspaceId, ws), eq(s.activities.leadId, id)),
        )
        .orderBy(desc(s.activities.createdAt))
        .all(),
    };
  });
  app.patch("/api/leads/:id", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request);
    await getLead(db, ws, id);
    const raw = z.record(z.string(), z.unknown()).parse(request.body);
    const parsed = leadInput.partial().parse(raw);
    const input = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => Object.hasOwn(raw, key)),
    );
    if (Object.hasOwn(input, "phone"))
      input.phone = normalizePhone(input.phone as string | null);
    return await db
      .update(s.leads)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(and(eq(s.leads.id, id), eq(s.leads.workspaceId, ws)))
      .returning()
      .get();
  });
  app.delete("/api/leads/:id", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request);
    await getLead(db, ws, id);
    for (const job of await db
      .select()
      .from(s.jobs)
      .where(
        and(
          eq(s.jobs.workspaceId, ws),
          eq(s.jobs.targetId, id),
          inArray(s.jobs.status, ["pending", "running", "paused"]),
        ),
      )
      .all())
      await queue.cancel(ws, job.id);
    await db
      .delete(s.leads)
      .where(and(eq(s.leads.id, id), eq(s.leads.workspaceId, ws)))
      .run();
    await db
      .insert(s.logs)
      .values({
        ...stamp(),
        workspaceId: ws,
        action: "lead.deleted",
        targetId: id,
      })
      .run();
    return { ok: true };
  });
  for (const kind of ["audit", "analyze"])
    app.post(`/api/leads/:id/${kind}`, async (request) => {
      const id = idOf(request);
      await getLead(db, request.auth.workspaceId, id);
      return await queue.enqueue(request.auth.workspaceId, kind, id);
    });
  app.post(
    "/api/leads/:id/score",
    async (request) =>
      await scoreLead(
        db,
        request.auth.workspaceId,
        idOf(request),
        (await getSettings(db, request.auth.workspaceId)).weights,
      ),
  );
  app.patch("/api/leads/:id/stage", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request),
      lead = await getLead(db, ws, id),
      { stage } = z.object({ stage: stageSchema }).parse(request.body);
    if (lead.stage === "Não contatar" && stage !== "Não contatar")
      throw new AppError(
        409,
        "Remova o bloqueio explicitamente na lista de supressão antes de mudar a etapa.",
      );
    return await db.transaction(async (tx) => {
      if (stage === "Não contatar")
        for (const contact of contacts(lead))
          await tx
            .insert(s.suppression)
            .values({
              ...stamp(),
              workspaceId: ws,
              contact,
              reason: "Não deseja novas abordagens",
            })
            .onConflictDoNothing()
            .run();
      await tx
        .insert(s.activities)
        .values({
          ...stamp(),
          workspaceId: ws,
          leadId: id,
          kind: "stage",
          text: `${lead.stage} → ${stage}`,
        })
        .run();
      return await tx
        .update(s.leads)
        .set({ stage, updatedAt: new Date().toISOString() })
        .where(and(eq(s.leads.workspaceId, ws), eq(s.leads.id, id)))
        .returning()
        .get();
    });
  });
  app.get("/api/pipeline", async (request) => {
    const { rows } = await filtered(request);
    return stages.map((stage) => ({
      stage,
      leads: rows.filter((l) => l.stage === stage),
    }));
  });
  app.get(
    "/api/searches",
    async (request) =>
      await db
        .select()
        .from(s.searches)
        .where(eq(s.searches.workspaceId, request.auth.workspaceId))
        .orderBy(desc(s.searches.createdAt))
        .limit(100)
        .all(),
  );
  app.post("/api/searches", async (request) => {
    const ws = request.auth.workspaceId,
      input = searchInput.parse(request.body),
      cacheKey = digest(JSON.stringify(input));
    const cached = await db
      .select()
      .from(s.searches)
      .where(
        and(
          eq(s.searches.workspaceId, ws),
          eq(s.searches.cacheKey, cacheKey),
          eq(s.searches.status, "completed"),
        ),
      )
      .orderBy(desc(s.searches.createdAt))
      .get();
    if (
      cached &&
      Date.now() - Date.parse(cached.createdAt) < 24 * 60 * 60 * 1000
    )
      return { ...cached, cached: true };
    const active = await db
      .select()
      .from(s.jobs)
      .where(
        and(
          eq(s.jobs.kind, "search"),
          inArray(s.jobs.status, ["pending", "running"]),
        ),
      )
      .get();
    if (active)
      throw new AppError(
        409,
        "Aguarde a pesquisa atual antes de iniciar outra.",
      );
    const last = await db
      .select()
      .from(s.searches)
      .orderBy(desc(s.searches.createdAt))
      .get();
    if (last && Date.now() - Date.parse(last.createdAt) < 60000)
      throw new AppError(
        429,
        "Aguarde um minuto entre pesquisas na fonte pública.",
      );
    const search = await db
      .insert(s.searches)
      .values({
        ...stamp(),
        workspaceId: ws,
        query: input,
        cacheKey,
        status: "pending",
      })
      .returning()
      .get();
    await queue.enqueue(ws, "search", search.id);
    return search;
  });
  app.get("/api/searches/:id", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request),
      search = await db
        .select()
        .from(s.searches)
        .where(and(eq(s.searches.workspaceId, ws), eq(s.searches.id, id)))
        .get();
    if (!search) throw new AppError(404, "Pesquisa não encontrada");
    return {
      ...search,
      results: (
        await db
          .select({ lead: s.leads })
          .from(s.results)
          .innerJoin(
            s.leads,
            and(
              eq(s.results.leadId, s.leads.id),
              eq(s.results.workspaceId, s.leads.workspaceId),
            ),
          )
          .where(and(eq(s.results.workspaceId, ws), eq(s.results.searchId, id)))
          .all()
      ).map((r) => r.lead),
      jobs: await db
        .select()
        .from(s.jobs)
        .where(and(eq(s.jobs.workspaceId, ws), eq(s.jobs.targetId, id)))
        .all(),
    };
  });
  app.post("/api/searches/:id/cancel", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request),
      job = await db
        .select()
        .from(s.jobs)
        .where(
          and(
            eq(s.jobs.workspaceId, ws),
            eq(s.jobs.targetId, id),
            eq(s.jobs.kind, "search"),
          ),
        )
        .get();
    if (!job) throw new AppError(404, "Pesquisa não encontrada");
    await queue.cancel(ws, job.id);
    await db
      .update(s.searches)
      .set({ status: "cancelled" })
      .where(and(eq(s.searches.id, id), eq(s.searches.workspaceId, ws)))
      .run();
    return { ok: true };
  });
  app.get(
    "/api/jobs",
    async (request) =>
      await db
        .select()
        .from(s.jobs)
        .where(eq(s.jobs.workspaceId, request.auth.workspaceId))
        .orderBy(desc(s.jobs.createdAt))
        .limit(100)
        .all(),
  );
  app.post(
    "/api/jobs/:id/cancel",
    async (request) =>
      await queue.cancel(request.auth.workspaceId, idOf(request)),
  );
  app.post("/api/jobs/:id/resume", async (request) => {
    const job = await db
      .update(s.jobs)
      .set({ status: "pending", attempts: 0, nextRunAt: 0, error: null })
      .where(
        and(
          eq(s.jobs.workspaceId, request.auth.workspaceId),
          eq(s.jobs.id, idOf(request)),
          inArray(s.jobs.status, ["paused", "failed"]),
        ),
      )
      .returning()
      .get();
    if (!job) throw new AppError(409, "Tarefa não pode ser retomada");
    return job;
  });
  app.get("/api/leads/:id/messages", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request);
    await getLead(db, ws, id);
    return await db
      .select()
      .from(s.messages)
      .where(and(eq(s.messages.workspaceId, ws), eq(s.messages.leadId, id)))
      .orderBy(desc(s.messages.createdAt))
      .all();
  });
  app.post("/api/leads/:id/messages", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request),
      lead = await getLead(db, ws, id);
    await assertContactAllowed(db, ws, lead);
    const { style, method, maxLength } = z
      .object({
        style: z
          .enum(["Direto", "Consultivo", "Profissional"])
          .default("Consultivo"),
        method: z.enum(["template", "gemini"]).default("template"),
        maxLength: z.number().int().min(200).max(450).default(450),
      })
      .parse(request.body);
    const settings = await getSettings(db, ws),
      audit =
        (
          await db
            .select()
            .from(s.audits)
            .where(and(eq(s.audits.workspaceId, ws), eq(s.audits.leadId, id)))
            .orderBy(desc(s.audits.createdAt))
            .get()
        )?.data || null;
    const text =
      method === "gemini"
        ? await ai.generateOutreach(
            ws,
            { name: lead.name, category: lead.category, audit },
            style,
            maxLength,
          )
        : `Olá, equipe da ${lead.name}! Sou da ${settings.company}. Desenvolvemos soluções digitais para empresas. Gostaria de entender se vocês têm alguma necessidade nessa área. Posso apresentar nossos serviços?`.slice(
            0,
            maxLength,
          );
    await assertContactAllowed(db, ws, await getLead(db, ws, id));
    return await db
      .insert(s.messages)
      .values({ ...stamp(), workspaceId: ws, leadId: id, text, style, method })
      .returning()
      .get();
  });
  app.patch("/api/messages/:id", async (request) => {
    const ws = request.auth.workspaceId,
      id = idOf(request),
      message = await db
        .select()
        .from(s.messages)
        .where(and(eq(s.messages.workspaceId, ws), eq(s.messages.id, id)))
        .get();
    if (!message) throw new AppError(404, "Mensagem não encontrada");
    await assertContactAllowed(db, ws, await getLead(db, ws, message.leadId));
    const input = z
      .object({
        text: z.string().min(1).max(1500),
        approved: z.boolean().default(false),
      })
      .parse(request.body);
    // Every edit creates a version, preserving history.
    return await db
      .insert(s.messages)
      .values({
        ...stamp(),
        workspaceId: ws,
        leadId: message.leadId,
        style: message.style,
        method: message.method,
        ...input,
      })
      .returning()
      .get();
  });
  app.post("/api/messages/:id/whatsapp", async (request) => {
    const ws = request.auth.workspaceId,
      message = await db
        .select()
        .from(s.messages)
        .where(
          and(eq(s.messages.workspaceId, ws), eq(s.messages.id, idOf(request))),
        )
        .get();
    if (!message) throw new AppError(404, "Mensagem não encontrada");
    if (!message.approved)
      throw new AppError(
        409,
        "Revise e aprove a mensagem antes de abrir o contato",
      );
    const lead = await getLead(db, ws, message.leadId);
    await assertContactAllowed(db, ws, lead);
    return { url: whatsappLink(lead.phone, message.text) };
  });
  app.get(
    "/api/activities",
    async (request) =>
      await db
        .select()
        .from(s.activities)
        .where(eq(s.activities.workspaceId, request.auth.workspaceId))
        .orderBy(desc(s.activities.createdAt))
        .limit(200)
        .all(),
  );
  app.post("/api/activities", async (request) => {
    const ws = request.auth.workspaceId,
      input = z
        .object({
          leadId: z.uuid(),
          text: z.string().min(2).max(2000),
          kind: z.enum(["note", "contact"]).default("note"),
        })
        .parse(request.body),
      lead = await getLead(db, ws, input.leadId);
    if (input.kind === "contact") await assertContactAllowed(db, ws, lead);
    return await db
      .insert(s.activities)
      .values({ ...stamp(), workspaceId: ws, ...input })
      .returning()
      .get();
  });
  app.get(
    "/api/tasks",
    async (request) =>
      await db
        .select()
        .from(s.tasks)
        .where(eq(s.tasks.workspaceId, request.auth.workspaceId))
        .orderBy(s.tasks.dueAt)
        .limit(500)
        .all(),
  );
  app.post("/api/tasks", async (request) => {
    const ws = request.auth.workspaceId,
      input = z
        .object({
          leadId: z.uuid(),
          title: z.string().min(2).max(250),
          dueAt: z.iso.datetime(),
        })
        .parse(request.body);
    await getLead(db, ws, input.leadId);
    return await db
      .insert(s.tasks)
      .values({ ...stamp(), workspaceId: ws, ...input })
      .returning()
      .get();
  });
  app.patch("/api/tasks/:id", async (request) => {
    const { done } = z.object({ done: z.boolean() }).parse(request.body);
    const result = await db
      .update(s.tasks)
      .set({ done, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(s.tasks.workspaceId, request.auth.workspaceId),
          eq(s.tasks.id, idOf(request)),
        ),
      )
      .returning()
      .get();
    if (!result) throw new AppError(404, "Tarefa não encontrada");
    return result;
  });
  app.get(
    "/api/settings",
    async (request) => await getSettings(db, request.auth.workspaceId),
  );
  app.patch(
    "/api/settings",
    async (request) =>
      await updateSettings(
        db,
        request.auth.workspaceId,
        settingsInput.parse(request.body),
      ),
  );
  app.post("/api/settings/test-ai", async (request) => {
    await ai.analyzeBusiness(request.auth.workspaceId, {
      name: "Teste de conexão",
      category: "Teste técnico",
      audit: null,
    });
    return { ok: true };
  });
  app.post("/api/settings/models", async (request) => {
    const input = z
      .object({ apiKey: z.string().trim().max(512).optional() })
      .strict()
      .parse(request.body ?? {});
    const apiKey =
      input.apiKey || (await getApiKey(db, request.auth.workspaceId));
    if (!apiKey)
      throw new AppError(
        400,
        "Cole sua chave da API para carregar os modelos.",
      );
    try {
      const client = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: 15000 },
      });
      const page = await client.models.list({ config: { pageSize: 1000 } });
      const models = page.page
        .filter(
          (model) =>
            model.name && model.supportedActions?.includes("generateContent"),
        )
        .map((model) => ({
          value: model.name!.replace(/^models\//, ""),
          label: model.displayName || model.name!,
        }));
      return { models };
    } catch {
      throw new AppError(
        502,
        "Não foi possível carregar os modelos. Confira a chave e tente novamente, ou cole o identificador do modelo abaixo.",
      );
    }
  });
  app.get(
    "/api/usage",
    async (request) =>
      await db
        .select()
        .from(s.usage)
        .where(eq(s.usage.workspaceId, request.auth.workspaceId))
        .orderBy(desc(s.usage.createdAt))
        .limit(100)
        .all(),
  );
  app.get(
    "/api/suppression",
    async (request) =>
      await db
        .select()
        .from(s.suppression)
        .where(eq(s.suppression.workspaceId, request.auth.workspaceId))
        .all(),
  );
  app.get("/api/dashboard", async (request) => {
    const { rows } = await filtered(request),
      ws = request.auth.workspaceId;
    const counts = Object.fromEntries(
      stages.map((stage) => [
        stage,
        rows.filter((l) => l.stage === stage).length,
      ]),
    );
    const selectedIds = new Set(rows.map((l) => l.id));
    const history = (
      await db
        .select()
        .from(s.activities)
        .where(eq(s.activities.workspaceId, ws))
        .all()
    ).filter((a) => selectedIds.has(a.leadId));
    const contactedIds = new Set(
      rows
        .filter((l) =>
          [
            "Contatado",
            "Respondeu",
            "Em negociação",
            "Cliente fechado",
          ].includes(l.stage),
        )
        .map((l) => l.id),
    );
    const respondedIds = new Set(
      rows
        .filter((l) =>
          ["Respondeu", "Em negociação", "Cliente fechado"].includes(l.stage),
        )
        .map((l) => l.id),
    );
    const responsesByDay: Record<string, number> = {},
      conversionsByDay: Record<string, number> = {};
    const seenResponses = new Set<string>(),
      seenConversions = new Set<string>();
    for (const event of history.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )) {
      const toStage = event.kind === "stage" ? event.text.split(" → ")[1] : "";
      if (
        event.kind === "contact" ||
        ["Contatado", "Respondeu", "Em negociação", "Cliente fechado"].includes(
          toStage,
        )
      )
        contactedIds.add(event.leadId);
      if (["Respondeu", "Em negociação", "Cliente fechado"].includes(toStage)) {
        respondedIds.add(event.leadId);
        if (!seenResponses.has(event.leadId)) {
          const day = event.createdAt.slice(0, 10);
          responsesByDay[day] = (responsesByDay[day] || 0) + 1;
          seenResponses.add(event.leadId);
        }
      }
      if (toStage === "Cliente fechado" && !seenConversions.has(event.leadId)) {
        const day = event.createdAt.slice(0, 10);
        conversionsByDay[day] = (conversionsByDay[day] || 0) + 1;
        seenConversions.add(event.leadId);
      }
    }
    const contacted = contactedIds.size,
      responded = respondedIds.size;
    const byDay: Record<string, number> = {},
      byCategory: Record<string, number> = {};
    for (const l of rows) {
      const date = l.createdAt.slice(0, 10);
      byDay[date] = (byDay[date] || 0) + 1;
      byCategory[l.category] = (byCategory[l.category] || 0) + 1;
    }
    return {
      total: rows.length,
      counts,
      highPriority: rows.filter((l) => (l.score ?? 0) >= 80).length,
      contacted,
      responded,
      responsesByDay: Object.entries(responsesByDay)
        .sort()
        .map(([name, value]) => ({ name, value })),
      conversionsByDay: Object.entries(conversionsByDay)
        .sort()
        .map(([name, value]) => ({ name, value })),
      responseRate: contacted ? (responded / contacted) * 100 : 0,
      conversionRate: rows.length
        ? (counts["Cliente fechado"] / rows.length) * 100
        : 0,
      pendingTasks: (
        await db
          .select()
          .from(s.tasks)
          .where(and(eq(s.tasks.workspaceId, ws), eq(s.tasks.done, false)))
          .all()
      ).length,
      aiCalls: (
        await db.select().from(s.usage).where(eq(s.usage.workspaceId, ws)).all()
      ).length,
      byDay: Object.entries(byDay)
        .sort()
        .map(([name, value]) => ({ name, value })),
      byCategory: Object.entries(byCategory).map(([name, value]) => ({
        name,
        value,
      })),
      scoreDistribution: [
        {
          name: "Dados insuficientes",
          value: rows.filter((l) => l.score === null).length,
        },
        ...[
          [0, 39],
          [40, 59],
          [60, 79],
          [80, 100],
        ].map(([min, max]) => ({
          name: `${min}–${max}`,
          value: rows.filter(
            (l) => l.score !== null && l.score >= min && l.score <= max,
          ).length,
        })),
      ],
    };
  });
  app.get("/api/export/leads", async (request, reply) => {
    const { rows } = await filtered(request);
    const columns = [
      "name",
      "category",
      "city",
      "state",
      "address",
      "website",
      "phone",
      "email",
      "stage",
      "score",
      "source",
      "sourceUrl",
    ];
    const csv = stringify(rows, {
      header: true,
      columns,
      escape_formulas: true,
    });
    reply
      .header("Content-Disposition", 'attachment; filename="leads.csv"')
      .type("text/csv; charset=utf-8");
    return "\uFEFF" + csv;
  });
  app.post("/api/import/leads", async (request) => {
    const { csv } = z
      .object({ csv: z.string().max(800000) })
      .parse(request.body);
    let records: Record<string, string>[];
    try {
      records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
        max_record_size: 10000,
      });
    } catch {
      throw new AppError(400, "CSV inválido");
    }
    if (records.length > 500)
      throw new AppError(400, "Limite de 500 registros por importação");
    const inputs = records.map((row) =>
      leadInput.parse(
        Object.fromEntries(
          [
            "name",
            "category",
            "city",
            "state",
            "address",
            "website",
            "phone",
            "email",
            "sourceUrl",
          ]
            .filter((k) => row[k])
            .map((k) => [k, row[k]]),
        ),
      ),
    );
    return await db.transaction(async (tx) => {
      let duplicates = 0;
      for (const input of inputs)
        if (
          (
            await saveLead(tx, request.auth.workspaceId, {
              ...input,
              source: "CSV",
            })
          ).duplicate
        )
          duplicates++;
      return { imported: inputs.length - duplicates, duplicates };
    });
  });
  app.get("/api/backup", async (request, reply) => {
    const ws = request.auth.workspaceId;
    const snapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      leads: await db
        .select()
        .from(s.leads)
        .where(eq(s.leads.workspaceId, ws))
        .all(),
      sources: await db
        .select()
        .from(s.sources)
        .where(eq(s.sources.workspaceId, ws))
        .all(),
      audits: await db
        .select()
        .from(s.audits)
        .where(eq(s.audits.workspaceId, ws))
        .all(),
      analyses: await db
        .select()
        .from(s.analyses)
        .where(eq(s.analyses.workspaceId, ws))
        .all(),
      messages: await db
        .select()
        .from(s.messages)
        .where(eq(s.messages.workspaceId, ws))
        .all(),
      activities: await db
        .select()
        .from(s.activities)
        .where(eq(s.activities.workspaceId, ws))
        .all(),
      tasks: await db
        .select()
        .from(s.tasks)
        .where(eq(s.tasks.workspaceId, ws))
        .all(),
      suppression: await db
        .select()
        .from(s.suppression)
        .where(eq(s.suppression.workspaceId, ws))
        .all(),
    };
    reply.header(
      "Content-Disposition",
      'attachment; filename="workspace-backup.json"',
    );
    return snapshot;
  });
  app.post("/api/retention", async (request) => {
    const { before } = z
        .object({ before: z.iso.datetime() })
        .parse(request.body),
      ws = request.auth.workspaceId;
    const ids = (
      await db
        .select()
        .from(s.activities)
        .where(eq(s.activities.workspaceId, ws))
        .all()
    )
      .filter((a) => a.createdAt < before)
      .map((a) => a.id);
    if (ids.length)
      await db
        .delete(s.activities)
        .where(
          and(eq(s.activities.workspaceId, ws), inArray(s.activities.id, ids)),
        )
        .run();
    await db
      .insert(s.logs)
      .values({ ...stamp(), workspaceId: ws, action: "history.cleaned" })
      .run();
    return { deleted: ids.length };
  });
  app.delete("/api/demo", async (request) => {
    const ws = request.auth.workspaceId,
      workspace = await db
        .select()
        .from(s.workspaces)
        .where(eq(s.workspaces.id, ws))
        .get();
    if (!workspace?.demo)
      throw new AppError(
        409,
        "Esta operação exige um workspace de demonstração",
      );
    await db
      .delete(s.leads)
      .where(and(eq(s.leads.workspaceId, ws), eq(s.leads.isDemo, true)))
      .run();
    return { ok: true };
  });
  const webRoot = resolve(root, "apps/web/dist");
  if (!process.env.VERCEL && existsSync(webRoot)) {
    const { default: staticPlugin } = await import("@fastify/static");
    await app.register(staticPlugin, { root: webRoot });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Rota não encontrada" })
        : reply.sendFile("index.html"),
    );
  }
  if (options.worker !== false) await queue.start();
  app.addHook("onClose", async () => queue.stop());
  return { app, queue };
}
