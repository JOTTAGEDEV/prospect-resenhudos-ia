import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../apps/api/src/app.js";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import * as s from "../apps/api/src/database/schema.js";
import { hashPassword } from "../apps/api/src/security/crypto.js";
import { leadInput } from "@jotage/shared";
import { saveLead } from "../apps/api/src/services/leads.js";
import { Queue } from "../apps/api/src/workers/queue.js";

const database = openDatabase(":memory:");
let app: Awaited<ReturnType<typeof buildApp>>["app"];
let queue: Queue;
let cookie = "";
let leadId = "";
let workspaceId = "";
let otherId = "";
let foreignLead = "";
const headers = () => ({ cookie, "x-requested-with": "JotageProspect" });
beforeAll(async () => {
  const user = {
    ...stamp(),
    email: "admin@jotage.local",
    passwordHash: await hashPassword("test-password-long"),
  };
  database.db.insert(s.users).values(user).run();
  const workspace = { ...stamp(), name: "Teste" },
    other = { ...stamp(), name: "Outro" };
  workspaceId = workspace.id;
  otherId = other.id;
  database.db.insert(s.workspaces).values([workspace, other]).run();
  database.db
    .insert(s.members)
    .values({ ...stamp(), workspaceId, userId: user.id })
    .run();
  foreignLead = saveLead(
    database.db,
    other.id,
    leadInput.parse({ name: "Empresa de outro workspace" }),
  ).lead.id;
  const built = await buildApp(database.db, {
    worker: false,
    search: {
      search: async () => [
        leadInput.parse({
          name: "Empresa teste descoberta",
          source: "OpenStreetMap",
          sourceId: "node/123",
        }),
      ],
    },
    auditor: {
      audit: async () => ({
        status: "not_informed",
        url: null,
        checkedAt: new Date().toISOString(),
        evidence: [],
        limitations: ["Sem site informado"],
      }),
    },
  });
  app = built.app;
  queue = built.queue;
});
afterAll(async () => {
  await app.close();
  database.sqlite.close();
});
describe("Fluxo integrado", () => {
  it("bloqueia acesso anônimo e CSRF", async () => {
    expect((await app.inject({ url: "/api/leads" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  it("autentica e emite cookie protegido", async () => {
    const result = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-requested-with": "JotageProspect" },
      payload: { username: "admin123", password: "test-password-long" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.headers["set-cookie"]).toContain("HttpOnly");
    expect(result.headers["set-cookie"]).toContain("SameSite=Strict");
    cookie = String(result.headers["set-cookie"]).split(";")[0];
  });
  it("valida credenciais e origem", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { "x-requested-with": "JotageProspect" },
          payload: { email: "admin@jotage.local", password: "errada" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/leads",
          headers: { ...headers(), origin: "https://evil.example" },
          payload: { name: "Empresa" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("persiste lead e deduplica criação", async () => {
    const input = {
      name: "Empresa de teste",
      city: "Palhoça",
      category: "Serviços",
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/leads",
      headers: headers(),
      payload: input,
    });
    expect(first.statusCode).toBe(200);
    leadId = first.json().lead.id;
    const second = await app.inject({
      method: "POST",
      url: "/api/leads",
      headers: headers(),
      payload: input,
    });
    expect(second.json().duplicate).toBe(true);
    expect(second.json().lead.id).toBe(leadId);
  });
  it("edição parcial preserva campos não enviados e rejeita fonte executável", async () => {
    await app.inject({
      method: "PATCH",
      url: `/api/leads/${leadId}`,
      headers: headers(),
      payload: {
        category: "Categoria específica",
        notes: "Nota preservada",
        tags: ["tag"],
      },
    });
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/leads/${leadId}`,
      headers: headers(),
      payload: { address: "Endereço informado" },
    });
    expect(edited.json().category).toBe("Categoria específica");
    expect(edited.json().notes).toBe("Nota preservada");
    expect(edited.json().tags).toEqual(["tag"]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/leads",
          headers: headers(),
          payload: { name: "Teste", sourceUrl: "javascript:alert(1)" },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("impede acesso e mudanças entre workspaces", async () => {
    for (const method of ["GET", "PATCH", "DELETE"] as const) {
      const result = await app.inject({
        method,
        url: `/api/leads/${foreignLead}`,
        headers: headers(),
        ...(method === "PATCH" ? { payload: { name: "Ataque" } } : {}),
      });
      expect(result.statusCode).toBe(404);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/workspace",
          headers: headers(),
          payload: { workspaceId: otherId },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("permite pipeline e registra histórico", async () => {
    const result = await app.inject({
      method: "PATCH",
      url: `/api/leads/${leadId}/stage`,
      headers: headers(),
      payload: { stage: "Qualificado" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().stage).toBe("Qualificado");
    const activities = await app.inject({
      url: "/api/activities",
      headers: headers(),
    });
    expect(activities.json()[0].text).toContain("Qualificado");
  });
  it("gera template manual e exige aprovação", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/api/leads/${leadId}/messages`,
      headers: headers(),
      payload: { method: "template" },
    });
    expect(created.statusCode).toBe(200);
    const message = created.json();
    expect(message.method).toBe("template");
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/messages/${message.id}/whatsapp`,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(409);
  });
  it("bloqueia contato suprimido mesmo após exclusão e reimportação", async () => {
    await app.inject({
      method: "PATCH",
      url: `/api/leads/${leadId}/stage`,
      headers: headers(),
      payload: { stage: "Não contatar" },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/leads/${leadId}/messages`,
          headers: headers(),
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
    await app.inject({
      method: "DELETE",
      url: `/api/leads/${leadId}`,
      headers: headers(),
    });
    const recreated = await app.inject({
      method: "POST",
      url: "/api/leads",
      headers: headers(),
      payload: {
        name: "Empresa de teste",
        city: "Palhoça",
        category: "Serviços",
      },
    });
    leadId = recreated.json().lead.id;
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/leads/${leadId}/messages`,
          headers: headers(),
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
  });
  it("descobre, salva resultados e reutiliza cache", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/searches",
      headers: headers(),
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    await queue.tick();
    const detail = await app.inject({
      url: `/api/searches/${response.json().id}`,
      headers: headers(),
    });
    expect(detail.json().results).toHaveLength(1);
    const cached = await app.inject({
      method: "POST",
      url: "/api/searches",
      headers: headers(),
      payload: {},
    });
    expect(cached.json().cached).toBe(true);
  });
  it("audita sem inventar site, calcula score desconhecido", async () => {
    await app.inject({
      method: "POST",
      url: `/api/leads/${leadId}/audit`,
      headers: headers(),
    });
    await queue.tick();
    const detail = await app.inject({
      url: `/api/leads/${leadId}`,
      headers: headers(),
    });
    expect(detail.json().audits[0].data.status).toBe("not_informed");
    expect(detail.json().lead.score).toBeNull();
  });
  it("valida CSV atomicamente e protege fórmulas no export", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/import/leads",
      headers: headers(),
      payload: { csv: "name,email\nEmpresa válida,ok@example.com\n,ruim" },
    });
    expect(bad.statusCode).toBe(400);
    const good = await app.inject({
      method: "POST",
      url: "/api/import/leads",
      headers: headers(),
      payload: { csv: "name,category\n=1+1,Serviços" },
    });
    expect(good.statusCode).toBe(200);
    const csv = await app.inject({
      url: "/api/export/leads",
      headers: headers(),
    });
    expect(csv.body).toContain("'=1+1");
  });
  it("dashboard reflete registros locais e não outro workspace", async () => {
    const response = await app.inject({
      url: "/api/dashboard",
      headers: headers(),
    });
    const count = database.db
      .select()
      .from(s.leads)
      .where(eq(s.leads.workspaceId, workspaceId))
      .all().length;
    expect(response.json().total).toBe(count);
  });
  it("recupera tarefa interrompida sem duplicar enfileiramento", async () => {
    const job = queue.enqueue(workspaceId, "audit", leadId);
    database.db
      .update(s.jobs)
      .set({ status: "running" })
      .where(eq(s.jobs.id, job.id))
      .run();
    queue.start();
    expect(
      database.db.select().from(s.jobs).where(eq(s.jobs.id, job.id)).get()
        ?.status,
    ).toBe("pending");
    expect(queue.enqueue(workspaceId, "audit", leadId).id).toBe(job.id);
    await queue.stop();
  });
  it("cancela tarefa pendente", () => {
    const job = queue.enqueue(workspaceId, "analyze", leadId);
    queue.cancel(workspaceId, job.id);
    expect(
      database.db.select().from(s.jobs).where(eq(s.jobs.id, job.id)).get()
        ?.status,
    ).toBe("cancelled");
  });
  it("altera senha somente após validar a atual", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/password",
          headers: headers(),
          payload: {
            currentPassword: "errada",
            newPassword: "nova-senha-segura-teste",
          },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/password",
          headers: headers(),
          payload: {
            currentPassword: "test-password-long",
            newPassword: "nova-senha-segura-teste",
          },
        })
      ).statusCode,
    ).toBe(200);
  });
});
