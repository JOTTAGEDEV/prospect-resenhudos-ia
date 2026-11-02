import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { searchInput } from "@jotage/shared";
import { GeminiProvider } from "../apps/api/src/providers/gemini.js";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { workspaces, usage } from "../apps/api/src/database/schema.js";
import { defaults, updateSettings } from "../apps/api/src/services/settings.js";
import { config } from "../apps/api/src/config.js";
import { AppError } from "../apps/api/src/services/leads.js";

const input = searchInput.parse({
  city: "Palhoça",
  state: "SC",
  radiusKm: 50,
  limit: 3,
});
const text =
  "Imobiliária Aurora em Palhoça, SC. Rua Central, 123. Telefone (48) 3222-3333. Email contato@aurora.example. Site oficial https://aurora.example/.";
const documents = [
  {
    id: 1,
    title: "Imobiliária Aurora — Contato",
    url: "https://aurora.example/contato",
    content: text,
  },
];
const cite = (value: string) => ({ value, sourceId: 1, quote: text });
const business = () => ({
  name: cite("Imobiliária Aurora"),
  websiteStatus: "has_website",
  website: cite("https://aurora.example/"),
  phone: cite("(48) 3222-3333"),
  email: cite("contato@aurora.example"),
  city: cite("Palhoça"),
  state: cite("SC"),
  address: cite("Rua Central, 123"),
});
let database: Awaited<ReturnType<typeof openDatabase>>;
let workspaceId: string;
const settings = {
  ...defaults,
  researchProvider: "openrouter" as const,
  searchProvider: "tavily" as const,
  model: "gemini-3.8-flash",
  openrouterModel: "openrouter/free",
  tavilyApiKey: "test-tavily",
  openrouterApiKey: "test-openrouter",
  dailyLimit: 20,
};

beforeEach(async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  database = await openDatabase(":memory:");
  const workspace = { ...stamp(), name: "Pesquisa OpenRouter" };
  workspaceId = workspace.id;
  await database.db.insert(workspaces).values(workspace).run();
  config.secret = "openrouter-research-test-secret".repeat(3);
  await updateSettings(database.db, workspaceId, settings);
});
afterEach(() => {
  database.sqlite.close();
  vi.unstubAllEnvs();
});

function mocks() {
  const googleGenerate = vi.fn();
  const googleClient = vi.fn(
    () =>
      ({
        models: { generateContent: googleGenerate },
      }) as unknown as GoogleGenAI,
  );
  const search = vi.fn().mockResolvedValue(documents);
  const router = vi.fn().mockResolvedValue({
    text: JSON.stringify({ businesses: [business()] }),
    tokens: 2345,
    model: "qwen/test:free",
  });
  const provider = new GeminiProvider(
    database.db,
    googleClient,
    search,
    router,
  );
  return { googleGenerate, googleClient, search, router, provider };
}
describe("OpenRouter gratuito para pesquisa com Tavily", () => {
  it("descobre sem chave Gemini, verifica citações reais e registra modelo/tokens OpenRouter", async () => {
    const { provider, search, router, googleClient } = mocks();
    const result = await provider.discoverBusinesses(workspaceId, input);
    expect(result.leads[0]).toMatchObject({
      name: "Imobiliária Aurora",
      phone: "554832223333",
      email: "contato@aurora.example",
      source: "Tavily + OpenRouter",
    });
    expect(result.report.text).toContain("organizada pelo OpenRouter");
    expect(result.report.sources[0].provider).toBe("Tavily");
    expect(search).toHaveBeenCalledTimes(1);
    expect(googleClient).not.toHaveBeenCalled();
    expect(router.mock.calls[0][0]).toMatchObject({
      key: "test-openrouter",
      model: "openrouter/free",
      maxTokens: 16384,
    });
    expect(JSON.parse(router.mock.calls[0][0].contents).documents).toEqual(
      documents,
    );
    expect(router.mock.calls[0][0].system).toContain("UNTRUSTED DATA");
    expect(router.mock.calls[0][0]).not.toHaveProperty("tools");
    const row = await database.db.select().from(usage).get();
    expect(row).toMatchObject({
      model: "openrouter:qwen/test:free",
      status: "completed",
      tokens: 2345,
    });
  });
  it("verifica contatos com o mesmo parser e rejeita um telefone inventado", async () => {
    const { provider, router, googleClient } = mocks();
    router.mockResolvedValue({
      text: JSON.stringify({ ...business(), phone: cite("(48) 99999-0000") }),
      tokens: 800,
      model: "qwen/test:free",
    });
    const report = await provider.researchContacts(workspaceId, {
      name: "Imobiliária Aurora",
      category: "Imobiliárias",
      city: "Palhoça",
      audit: null,
    });
    expect(report.company).toMatchObject({
      websiteStatus: "has_website",
      website: "https://aurora.example/",
      phone: null,
      email: "contato@aurora.example",
    });
    expect(googleClient).not.toHaveBeenCalled();
  });
  it("analisa e gera mensagens pelo Gemini selecionado, sem redirecionar ao OpenRouter", async () => {
    await updateSettings(database.db, workspaceId, {
      ...settings,
      apiKey: "test-gemini",
    });
    const { provider, router, search, googleGenerate } = mocks();
    googleGenerate
      .mockResolvedValueOnce({
        text: JSON.stringify({
          businessSummary: "Resumo com evidências",
          opportunities: [],
          recommendedService: "Site",
          suggestedApproach: "Conversar",
          limitations: ["Sem auditoria"],
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          text: "Olá, posso apresentar uma ideia para sua empresa?",
        }),
      });
    await provider.analyzeBusiness(workspaceId, {
      name: "Empresa",
      category: "Serviços",
      audit: null,
    });
    await provider.generateOutreach(
      workspaceId,
      { name: "Empresa", category: "Serviços", audit: null },
      "Direto",
      450,
    );
    expect(googleGenerate).toHaveBeenCalledTimes(2);
    expect(googleGenerate.mock.calls[0][0].model).toBe("gemini-3.8-flash");
    expect(router).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
  it("testa apenas conexão/JSON no provedor de pesquisa, sem Tavily nem Google", async () => {
    await updateSettings(database.db, workspaceId, {
      ...settings,
      searchProvider: "gemini",
    });
    const { provider, router, search, googleClient } = mocks();
    router.mockResolvedValue({
      text: '{"ok":true}',
      tokens: 25,
      model: "qwen/test:free",
    });
    await provider.testResearch(workspaceId);
    expect(search).not.toHaveBeenCalled();
    expect(googleClient).not.toHaveBeenCalled();
    expect(router.mock.calls[0][0]).toMatchObject({
      contents: "{}",
      maxTokens: 2048,
      effort: "low",
    });
    expect(router.mock.calls[0][0].system).toContain(
      "Do not browse or research any company",
    );
    router.mockResolvedValue({
      text: '{"ok":false}',
      tokens: 25,
      model: "qwen/test:free",
    });
    await expect(provider.testResearch(workspaceId)).rejects.toThrow(
      "OpenRouter retornou uma estrutura inválida",
    );
  });
  it("exige fonte Tavily para pesquisa e impede modelos pagos antes de consultar fontes", async () => {
    const { provider, search, router } = mocks();
    await updateSettings(database.db, workspaceId, {
      ...settings,
      searchProvider: "gemini",
    });
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toThrow("exige Tavily");
    await updateSettings(database.db, workspaceId, {
      ...settings,
      openrouterModel: "vendor/model-paid",
    });
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toThrow("Modelos pagos não são usados");
    expect(search).not.toHaveBeenCalled();
    expect(router).not.toHaveBeenCalled();
    expect(await database.db.select().from(usage).all()).toHaveLength(0);
  });
  it("reserva o teto global antes de Tavily e libera somente a reserva quando não chamou IA", async () => {
    await updateSettings(database.db, workspaceId, {
      ...settings,
      dailyLimit: 1,
    });
    const { provider, search, router } = mocks();
    search
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue(documents);
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toThrow("não retornou fontes");
    expect(router).not.toHaveBeenCalled();
    expect(await database.db.select().from(usage).all()).toHaveLength(0);
    await provider.discoverBusinesses(workspaceId, input);
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(search).toHaveBeenCalledTimes(3);
    expect(router).toHaveBeenCalledTimes(1);
  });
  it("mantém falhas reais OpenRouter no contador sem chamar Gemini como fallback", async () => {
    const { provider, router, googleClient } = mocks();
    router.mockRejectedValue(
      new AppError(429, "OpenRouter atingiu o limite gratuito"),
    );
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(await database.db.select().from(usage).get()).toMatchObject({
      model: "openrouter:openrouter/free",
      status: "failed",
    });
    expect(googleClient).not.toHaveBeenCalled();
  });
});
