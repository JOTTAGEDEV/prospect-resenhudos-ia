import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import * as s from "../apps/api/src/database/schema.js";
import {
  hashPassword,
  verifyPassword,
} from "../apps/api/src/security/crypto.js";
import {
  findLoginUser,
  publicAccount,
  resetWorkspace,
  updateProfile,
} from "../apps/api/src/services/account.js";
import { defaults } from "../apps/api/src/services/settings.js";
import { saveLead } from "../apps/api/src/services/leads.js";
import { leadInput, type LeadInput } from "@jotage/shared";
import { Queue } from "../apps/api/src/workers/queue.js";
import { buildApp } from "../apps/api/src/app.js";
import { createHandler } from "../apps/api/src/services/job-handler.js";

let database: Awaited<ReturnType<typeof openDatabase>>;
let userId: string;
let workspaceId: string;
let otherWorkspaceId: string;
let passwordHash: string;
beforeEach(async () => {
  database = await openDatabase(":memory:");
  passwordHash = await hashPassword("account-test-only-password");
  const user = { ...stamp(), email: "admin@jotage.local", passwordHash };
  const workspace = { ...stamp(), name: "Original" };
  const other = { ...stamp(), name: "Outro workspace" };
  userId = user.id;
  workspaceId = workspace.id;
  otherWorkspaceId = other.id;
  await database.db.insert(s.users).values(user).run();
  await database.db.insert(s.workspaces).values([workspace, other]).run();
  await database.db
    .insert(s.members)
    .values({ ...stamp(), userId, workspaceId, role: "admin" })
    .run();
  await database.db
    .insert(s.settings)
    .values({
      ...stamp(),
      workspaceId,
      data: { ...defaults, model: "configured-model", dailyLimit: 75 },
      encryptedKey: "stored-ciphertext",
    })
    .run();
});
afterEach(() => {
  database.sqlite.close();
});

it("migra o alias legado para usuário persistido sem alterar senha, chave ou quota", async () => {
  expect((await findLoginUser(database.db, "admin123"))?.id).toBe(userId);
  expect(
    await updateProfile(database.db, userId, workspaceId, {
      username: "Admin1234",
      displayName: "LC Dev",
      company: "JG Dev",
    }),
  ).toEqual({
    username: "admin1234",
    displayName: "LC Dev",
    company: "JG Dev",
  });
  expect(await findLoginUser(database.db, "admin123")).toBeUndefined();
  const renamed = await findLoginUser(database.db, " ADMIN1234 ");
  expect(renamed?.id).toBe(userId);
  expect(renamed?.passwordHash).toBe(passwordHash);
  expect(
    await verifyPassword("account-test-only-password", renamed!.passwordHash),
  ).toBe(true);
  expect(await publicAccount(database.db, userId)).toEqual({
    username: "admin1234",
    displayName: "LC Dev",
  });
  const settings = await database.db
    .select()
    .from(s.settings)
    .where(eq(s.settings.workspaceId, workspaceId))
    .get();
  expect(settings?.encryptedKey).toBe("stored-ciphertext");
  expect(settings?.data).toMatchObject({
    company: "JG Dev",
    model: "configured-model",
    dailyLimit: 75,
  });
  expect(
    (
      await database.db
        .select()
        .from(s.workspaces)
        .where(eq(s.workspaces.id, workspaceId))
        .get()
    )?.name,
  ).toBe("JG Dev");
  expect(
    (
      await database.db
        .select()
        .from(s.workspaces)
        .where(eq(s.workspaces.id, otherWorkspaceId))
        .get()
    )?.name,
  ).toBe("Outro workspace");
});

it("bloqueia duplicidade de usuário e alterações por membro sem papel admin", async () => {
  await database.db
    .insert(s.users)
    .values({
      ...stamp(),
      email: "other@example.test",
      username: "occupied",
      passwordHash,
    })
    .run();
  await expect(
    updateProfile(database.db, userId, workspaceId, {
      username: "occupied",
      displayName: "LC Dev",
      company: "JG Dev",
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(
    (
      await database.db
        .select()
        .from(s.users)
        .where(eq(s.users.id, userId))
        .get()
    )?.username,
  ).toBeNull();
  await database.db
    .update(s.members)
    .set({ role: "viewer" })
    .where(eq(s.members.userId, userId))
    .run();
  await expect(
    updateProfile(database.db, userId, workspaceId, {
      username: "newadmin",
      displayName: "Novo",
      company: "Nova",
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(
    resetWorkspace(
      database.db,
      new Queue(database.db, vi.fn()),
      userId,
      workspaceId,
      { confirmation: "APAGAR LEADS E HISTORICOS" },
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
});

async function populate(workspace: string) {
  const { lead } = await saveLead(
    database.db,
    workspace,
    leadInput.parse({ name: "Empresa exemplo" }),
  );
  const search = {
    ...stamp(),
    workspaceId: workspace,
    query: { city: "Palhoça" },
    cacheKey: "cache",
    status: "completed",
  };
  await database.db.insert(s.searches).values(search).run();
  await database.db
    .insert(s.results)
    .values({
      ...stamp(),
      workspaceId: workspace,
      leadId: lead.id,
      searchId: search.id,
    })
    .run();
  const related = { ...stamp(), workspaceId: workspace, leadId: lead.id };
  await database.db
    .insert(s.audits)
    .values({
      ...related,
      data: {
        status: "not_informed",
        url: null,
        checkedAt: new Date().toISOString(),
        evidence: [],
        limitations: [],
      },
    })
    .run();
  await database.db
    .insert(s.analyses)
    .values({
      ...related,
      data: {
        businessSummary: "Teste",
        opportunities: [],
        recommendedService: "Teste",
        suggestedApproach: "Teste",
        limitations: [],
      },
      evidenceHash: "hash",
    })
    .run();
  await database.db
    .insert(s.scores)
    .values({
      ...related,
      data: {
        value: null,
        status: "insufficient",
        factors: [],
        calculatedAt: new Date().toISOString(),
      },
    })
    .run();
  await database.db
    .insert(s.messages)
    .values({ ...related, text: "Teste", style: "Teste", method: "manual" })
    .run();
  await database.db
    .insert(s.activities)
    .values({ ...related, text: "Histórico", kind: "note" })
    .run();
  await database.db
    .insert(s.tasks)
    .values({ ...related, title: "Tarefa", dueAt: new Date().toISOString() })
    .run();
  await database.db
    .insert(s.logs)
    .values({ ...stamp(), workspaceId: workspace, action: "search.created" })
    .run();
  const queue = new Queue(database.db, vi.fn());
  const job = await queue.enqueue(workspace, "search", search.id);
  return { lead, job, queue };
}

it("limpa apenas os dados operacionais do workspace e preserva acesso, integração, consumo e não contatar", async () => {
  const own = await populate(workspaceId);
  const other = await populate(otherWorkspaceId);
  await database.db
    .insert(s.usage)
    .values({
      ...stamp(),
      workspaceId,
      model: "configured-model",
      status: "completed",
      tokens: 1234,
    })
    .run();
  await database.db
    .insert(s.suppression)
    .values({
      ...stamp(),
      workspaceId,
      contact: "blocked@example.test",
      reason: "Solicitou não contatar",
    })
    .run();
  await database.db
    .insert(s.sessions)
    .values({
      id: "test-session",
      userId,
      workspaceId,
      expiresAt: Date.now() + 60000,
    })
    .run();
  const cancel = vi.spyOn(own.queue, "cancel");
  await expect(
    resetWorkspace(database.db, own.queue, userId, workspaceId, {
      confirmation: "APAGAR LEADS E HISTORICOS",
    }),
  ).resolves.toEqual({ ok: true, deletedLeads: 1, deletedSearches: 1 });
  expect(cancel).toHaveBeenCalledWith(workspaceId, own.job.id);
  expect(cancel).not.toHaveBeenCalledWith(otherWorkspaceId, other.job.id);
  for (const table of [
    s.jobs,
    s.results,
    s.sources,
    s.audits,
    s.analyses,
    s.scores,
    s.messages,
    s.activities,
    s.tasks,
    s.leads,
    s.searches,
    s.logs,
  ]) {
    expect(
      await database.db
        .select()
        .from(table)
        .where(eq(table.workspaceId, workspaceId))
        .all(),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(table)
        .where(eq(table.workspaceId, otherWorkspaceId))
        .all(),
    ).toHaveLength(1);
  }
  expect(await database.db.select().from(s.sessions).all()).toHaveLength(1);
  expect(await database.db.select().from(s.settings).all()).toHaveLength(1);
  expect(await database.db.select().from(s.suppression).all()).toHaveLength(1);
  expect((await database.db.select().from(s.usage).all())[0].tokens).toBe(1234);
  expect((await findLoginUser(database.db, "admin123"))?.passwordHash).toBe(
    passwordHash,
  );
  const handler = vi.fn();
  await new Queue(database.db, handler).tick(own.job.id);
  expect(handler).not.toHaveBeenCalled();
});

it("exige confirmação e pertencimento administrativo antes de apagar", async () => {
  const own = await populate(workspaceId);
  await expect(
    resetWorkspace(database.db, own.queue, userId, workspaceId, {}),
  ).rejects.toThrow();
  await expect(
    resetWorkspace(database.db, own.queue, userId, otherWorkspaceId, {
      confirmation: "APAGAR LEADS E HISTORICOS",
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(await database.db.select().from(s.leads).all()).toHaveLength(1);
});

it("não recria leads quando uma resposta antiga chega após a limpeza em outra instância", async () => {
  let resolveSearch!: (leads: LeadInput[]) => void;
  let providerStarted!: () => void;
  const response = new Promise<LeadInput[]>((resolve) => {
    resolveSearch = resolve;
  });
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  const worker = new Queue(
    database.db,
    createHandler(
      database.db,
      {
        search: async () => {
          providerStarted();
          return response;
        },
      },
      { audit: vi.fn() },
      { analyzeBusiness: vi.fn(), generateOutreach: vi.fn() },
    ),
  );
  const search = {
    ...stamp(),
    workspaceId,
    query: { excludeWithWebsite: false },
    cacheKey: "in-flight",
    status: "pending",
  };
  await database.db.insert(s.searches).values(search).run();
  const job = await worker.enqueue(workspaceId, "search", search.id);
  const pending = worker.tick(job.id);
  await started;
  // A separate Queue cannot abort the first instance's in-memory AbortController.
  const otherInstance = new Queue(database.db, vi.fn());
  await resetWorkspace(database.db, otherInstance, userId, workspaceId, {
    confirmation: "APAGAR LEADS E HISTORICOS",
  });
  resolveSearch([leadInput.parse({ name: "Resposta atrasada" })]);
  await pending;
  expect(await database.db.select().from(s.leads).all()).toHaveLength(0);
  expect(await database.db.select().from(s.jobs).all()).toHaveLength(0);
  expect(await database.db.select().from(s.searches).all()).toHaveLength(0);
  await worker.stop();
});

it("integra perfil, login novo, sessão, autenticação e limpeza pela API", async () => {
  const { app } = await buildApp(database.db, { worker: false });
  const requestHeaders = { "x-requested-with": "JotageProspect" };
  const profile = {
    username: "admin1234",
    displayName: "LC Dev",
    company: "JG Dev",
  };
  try {
    const anonymous = await app.inject({
      method: "PATCH",
      url: "/api/account/profile",
      headers: requestHeaders,
      payload: profile,
    });
    expect(anonymous.statusCode).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: requestHeaders,
      payload: { username: "admin123", password: "account-test-only-password" },
    });
    expect(login.statusCode).toBe(200);
    const headers = {
      ...requestHeaders,
      cookie: String(login.headers["set-cookie"]).split(";")[0],
    };
    const update = await app.inject({
      method: "PATCH",
      url: "/api/account/profile",
      headers,
      payload: profile,
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toEqual(profile);
    const me = await app.inject({ url: "/api/auth/me", headers });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      username: "admin1234",
      displayName: "LC Dev",
      workspaceId,
      workspaces: [{ id: workspaceId, name: "JG Dev" }],
    });
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: requestHeaders,
      payload: { username: "admin123", password: "account-test-only-password" },
    });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: requestHeaders,
      payload: {
        username: "admin1234",
        password: "account-test-only-password",
      },
    });
    expect(newLogin.statusCode).toBe(200);
    await populate(workspaceId);
    const rejected = await app.inject({
      method: "POST",
      url: "/api/account/reset",
      headers,
      payload: {},
    });
    expect(rejected.statusCode).toBe(400);
    expect(await database.db.select().from(s.leads).all()).toHaveLength(1);
    const reset = await app.inject({
      method: "POST",
      url: "/api/account/reset",
      headers,
      payload: { confirmation: "APAGAR LEADS E HISTORICOS" },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({
      ok: true,
      deletedLeads: 1,
      deletedSearches: 1,
    });
    expect((await app.inject({ url: "/api/leads", headers })).statusCode).toBe(
      200,
    );
    expect(await database.db.select().from(s.leads).all()).toHaveLength(0);
    expect(
      (await app.inject({ url: "/api/auth/me", headers })).json().username,
    ).toBe("admin1234");
  } finally {
    await app.close();
  }
});
