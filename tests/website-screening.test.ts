import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  leadInput,
  searchInput,
  websiteScreeningSchema,
  type LeadInput,
} from "@jotage/shared";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import * as s from "../apps/api/src/database/schema.js";
import { Queue } from "../apps/api/src/workers/queue.js";
import { createHandler } from "../apps/api/src/services/job-handler.js";
import { AppError } from "../apps/api/src/services/leads.js";
import { businessWebsite } from "../apps/api/src/services/website-screening.js";

let database: Awaited<ReturnType<typeof openDatabase>>;
let workspaceId: string;
const discover = vi.fn<() => Promise<LeadInput[]>>();
const research = vi.fn();
const audit = vi.fn();
let queue: Queue;
beforeEach(async () => {
  database = await openDatabase(":memory:");
  const workspace = { ...stamp(), name: "Verificação" };
  workspaceId = workspace.id;
  await database.db.insert(s.workspaces).values(workspace).run();
  discover.mockReset();
  research.mockReset();
  audit.mockReset();
  queue = new Queue(
    database.db,
    createHandler(
      database.db,
      { search: discover },
      { audit },
      {
        researchContacts: research,
        analyzeBusiness: vi.fn(),
        generateOutreach: vi.fn(),
      },
    ),
  );
  research.mockResolvedValue({
    text: "SITE_NAO_LOCALIZADO\nEmpresa identificada; não localizamos site.",
    sources: [{ title: "Fonte pública", url: "https://example.org/empresa" }],
  });
  audit.mockImplementation(async (url: string) => ({
    status: "completed",
    httpStatus: 200,
    url,
    checkedAt: new Date().toISOString(),
    evidence: [],
    limitations: [],
  }));
});
afterEach(async () => {
  await queue.stop();
  database.sqlite.close();
});
async function start(items: LeadInput[]) {
  discover.mockResolvedValue(items);
  const record = {
    ...stamp(),
    workspaceId,
    query: searchInput.parse({ excludeWithWebsite: true }),
    cacheKey: "test",
    status: "pending",
  };
  await database.db.insert(s.searches).values(record).run();
  return queue.enqueue(workspaceId, "search", record.id);
}
async function tick(id: string) {
  await database.db
    .update(s.jobs)
    .set({ nextRunAt: 0 })
    .where(eq(s.jobs.id, id))
    .run();
  await queue.tick(id);
  return (await database.db
    .select()
    .from(s.jobs)
    .where(eq(s.jobs.id, id))
    .get())!;
}

it("preserva checkpoints entre workers e só salva empresas pesquisadas sem site localizado", async () => {
  const job = await start([
    leadInput.parse({ name: "Com site", website: "https://example.com/" }),
    leadInput.parse({
      name: "Rede social",
      website: "https://instagram.com/loja",
    }),
    leadInput.parse({ name: "Site descoberto pela IA" }),
  ]);
  await tick(job.id);
  expect(await database.db.select().from(s.leads).all()).toHaveLength(0);
  await tick(job.id);
  expect(research).not.toHaveBeenCalled();
  // A new Queue instance simulates a separate serverless invocation.
  queue = new Queue(
    database.db,
    createHandler(
      database.db,
      { search: discover },
      { audit },
      {
        researchContacts: research,
        analyzeBusiness: vi.fn(),
        generateOutreach: vi.fn(),
      },
    ),
  );
  await tick(job.id);
  research.mockResolvedValueOnce({
    text: "SITE_CONFIRMADO: https://empresa.example/\nSite oficial da empresa correta.",
    sources: [{ title: "Fonte", url: "https://empresa.example/" }],
  });
  await tick(job.id);
  const final = await tick(job.id);
  expect(final.status).toBe("completed");
  expect(discover).toHaveBeenCalledTimes(1);
  expect(
    (await database.db.select().from(s.leads).all()).map((l) => l.name),
  ).toEqual(["Rede social"]);
  expect(
    websiteScreeningSchema
      .parse(final.result)
      .candidates.map((c) => c.decision),
  ).toEqual(["has_website", "not_found", "has_website"]);
  expect(research.mock.calls[0][1].purpose).toBe("website_verification");
});

it("não transforma quota ou indisponibilidade em ausência de site e evita repetir chamadas", async () => {
  research.mockRejectedValue(
    new AppError(429, "Quota Google Search indisponível"),
  );
  const job = await start([
    leadInput.parse({ name: "Empresa A" }),
    leadInput.parse({ name: "Empresa B" }),
  ]);
  await tick(job.id);
  await tick(job.id);
  const final = await tick(job.id);
  expect(final.status).toBe("paused");
  expect(research).toHaveBeenCalledTimes(1);
  expect(
    websiteScreeningSchema
      .parse(final.result)
      .candidates.every((c) => c.decision === "pending"),
  ).toBe(true);
  expect(await database.db.select().from(s.leads).all()).toHaveLength(0);
});

it("encerra a janela de dez minutos sem inventar resultados nem perder o progresso", async () => {
  const job = await start([leadInput.parse({ name: "Empresa pendente" })]);
  const pending = await tick(job.id);
  const checkpoint = websiteScreeningSchema.parse(pending.result);
  checkpoint.deadline = Date.now() - 1;
  await database.db
    .update(s.jobs)
    .set({ result: checkpoint })
    .where(eq(s.jobs.id, job.id))
    .run();
  const final = await tick(job.id);
  expect(final.status).toBe("completed");
  expect(research).not.toHaveBeenCalled();
  expect(
    websiteScreeningSchema.parse(final.result).candidates[0].decision,
  ).toBe("inconclusive");
});

it("não descarta por site inacessível ou resposta ambígua, nem retoma uma tarefa cancelada", async () => {
  audit.mockResolvedValue({
    status: "partial",
    httpStatus: 404,
    url: "https://example.com",
    evidence: [],
    limitations: [],
    checkedAt: new Date().toISOString(),
  });
  const job = await start([
    leadInput.parse({ name: "Site antigo", website: "https://example.com" }),
    leadInput.parse({ name: "Não verificada" }),
  ]);
  await tick(job.id);
  const checkpoint = await tick(job.id);
  expect(
    websiteScreeningSchema.parse(checkpoint.result).candidates[0].decision,
  ).toBe("inconclusive");
  await queue.cancel(workspaceId, job.id);
  expect((await tick(job.id)).status).toBe("cancelled");
  expect(research).toHaveBeenCalledTimes(1);
  expect(await database.db.select().from(s.leads).all()).toHaveLength(0);
});

it("exclui redes sociais e diretórios da definição de site próprio", () => {
  for (const value of [
    "https://instagram.com/a",
    "https://www.facebook.com/a",
    "https://wa.me/55",
    "https://www.booking.com/hotel/a",
    "javascript:alert(1)",
  ])
    expect(businessWebsite(value)).toBeNull();
  expect(businessWebsite("https://empresa.com.br")).toBe(
    "https://empresa.com.br/",
  );
});

it("descobre com Gemini sem depender do OpenStreetMap e salva contatos sustentados pela pesquisa", async () => {
  const discoverBusinesses = vi.fn().mockResolvedValue({
    leads: [
      leadInput.parse({
        name: "Empresa Google",
        city: "Palhoça",
        source: "Google Search",
      }),
    ],
    report: {
      text: "Descoberta com fontes públicas.",
      sources: [
        { title: "Google Maps", url: "https://maps.google.com/empresa" },
      ],
    },
  });
  queue = new Queue(
    database.db,
    createHandler(
      database.db,
      undefined,
      { audit },
      {
        discoverBusinesses,
        researchContacts: research,
        analyzeBusiness: vi.fn(),
        generateOutreach: vi.fn(),
      },
    ),
  );
  research.mockResolvedValue({
    text: "Empresa correta; site próprio não localizado nesta pesquisa.",
    sources: [{ title: "Fonte pública", url: "https://example.org/empresa" }],
    company: {
      websiteStatus: "not_found",
      phone: "+5548999990000",
      email: "contato@example.org",
      address: "Rua Um, 20",
      city: "Palhoça",
      state: "SC",
      mapsUrl: "https://maps.google.com/empresa",
    },
  });
  const job = await start([]);
  await tick(job.id);
  await tick(job.id);
  const final = await tick(job.id);
  expect(final.status).toBe("completed");
  expect(discover).not.toHaveBeenCalled();
  expect(discoverBusinesses).toHaveBeenCalledTimes(1);
  const lead = (await database.db.select().from(s.leads).all())[0];
  expect(lead.phone).toBe("5548999990000");
  expect(lead.email).toBe("contato@example.org");
  expect(lead.notes).toContain("Google Maps");
  expect(
    websiteScreeningSchema.parse(final.result).discoveryReport?.sources,
  ).toHaveLength(1);
});

it("pesquisa novamente um site antigo e descarta quando novas fontes confirmam o site oficial", async () => {
  audit.mockResolvedValue({
    status: "unavailable",
    url: "https://antigo.example",
    checkedAt: new Date().toISOString(),
    evidence: [],
    limitations: ["Robots indisponível"],
  });
  research.mockResolvedValue({
    text: "Site oficial confirmado em fontes públicas.",
    sources: [{ title: "Fonte", url: "https://atual.example/" }],
    company: {
      websiteStatus: "has_website",
      website: "https://atual.example/",
      city: "Palhoça",
    },
  });
  const job = await start([
    leadInput.parse({
      name: "Empresa Google",
      website: "https://antigo.example",
    }),
  ]);
  await tick(job.id);
  await tick(job.id);
  const final = await tick(job.id);
  expect(
    websiteScreeningSchema.parse(final.result).candidates[0].decision,
  ).toBe("has_website");
  expect(research).toHaveBeenCalledTimes(1);
  expect(await database.db.select().from(s.leads).all()).toHaveLength(0);
});
