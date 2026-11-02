import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { searchInput } from "@jotage/shared";
import { GeminiProvider } from "../apps/api/src/providers/gemini.js";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { workspaces, usage } from "../apps/api/src/database/schema.js";
import { defaults, updateSettings } from "../apps/api/src/services/settings.js";
import { config } from "../apps/api/src/config.js";
import { AppError } from "../apps/api/src/services/leads.js";
import { GroqResponseError } from "../apps/api/src/providers/groq.js";
import {
  groqResearchDocuments,
  GROQ_DOCUMENT_BYTES,
} from "../apps/api/src/providers/groq-documents.js";

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
  researchProvider: "groq" as const,
  searchProvider: "tavily" as const,
  groqModel: "openai/gpt-oss-120b",
  tavilyApiKey: "tavily-fake",
  groqApiKey: "groq-fake",
  dailyLimit: 20,
};
beforeEach(async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GROQ_API_KEY", "");
  database = await openDatabase(":memory:");
  const workspace = { ...stamp(), name: "Pesquisa Groq" };
  workspaceId = workspace.id;
  await database.db.insert(workspaces).values(workspace).run();
  config.secret = "groq-research-test-secret".repeat(3);
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
  const router = vi.fn();
  const groq = vi.fn().mockResolvedValue({
    text: JSON.stringify({ businesses: [business()] }),
    tokens: 1234,
    model: "openai/gpt-oss-120b",
  });
  const provider = new GeminiProvider(
    database.db,
    googleClient,
    search,
    router,
    groq,
  );
  return { provider, search, router, groq, googleClient, googleGenerate };
}
describe("Groq + Tavily research", () => {
  it("discovers sourced contacts without Gemini or OpenRouter and records actual Groq usage", async () => {
    const { provider, groq, search, googleClient, router } = mocks();
    const result = await provider.discoverBusinesses(workspaceId, input);
    expect(result.leads[0]).toMatchObject({
      name: "Imobiliária Aurora",
      phone: "554832223333",
      source: "Tavily + Groq",
    });
    expect(result.report.text).toContain("organizada pelo Groq");
    expect(groq.mock.calls[0][0]).toMatchObject({
      key: "groq-fake",
      model: "openai/gpt-oss-120b",
      maxTokens: 4096,
      effort: "high",
    });
    expect(JSON.parse(groq.mock.calls[0][0].contents).documents).toEqual(
      documents,
    );
    expect(search.mock.calls[0][2]).toBe(6);
    expect(googleClient).not.toHaveBeenCalled();
    expect(router).not.toHaveBeenCalled();
    expect(await database.db.select().from(usage).get()).toMatchObject({
      model: "groq:openai/gpt-oss-120b",
      tokens: 1234,
      status: "completed",
    });
  });
  it("checks citations and refuses invented phone numbers", async () => {
    const { provider, groq } = mocks();
    groq.mockResolvedValue({
      text: JSON.stringify({ ...business(), phone: cite("(48) 99999-0000") }),
      tokens: 900,
      model: "openai/gpt-oss-120b",
    });
    const report = await provider.researchContacts(workspaceId, {
      name: "Imobiliária Aurora",
      category: "Imobiliárias",
      city: "Palhoça",
      audit: null,
    });
    expect(report.company).toMatchObject({
      phone: null,
      email: "contato@aurora.example",
      websiteStatus: "has_website",
    });
  });
  it("tests only Groq JSON connection, without spending Tavily credit", async () => {
    await updateSettings(database.db, workspaceId, {
      ...settings,
      searchProvider: "gemini",
    });
    const { provider, groq, search, googleClient, router } = mocks();
    groq.mockResolvedValue({
      text: '{"ok":true}',
      tokens: 20,
      model: "openai/gpt-oss-120b",
    });
    await provider.testResearch(workspaceId);
    expect(groq.mock.calls[0][0]).toMatchObject({
      contents: "{}",
      maxTokens: 2048,
      effort: "low",
    });
    expect(search).not.toHaveBeenCalled();
    expect(googleClient).not.toHaveBeenCalled();
    expect(router).not.toHaveBeenCalled();
  });
  it("requires a Groq key and Tavily before searching or consuming local quota", async () => {
    const { provider, groq, search } = mocks();
    await updateSettings(database.db, workspaceId, {
      ...settings,
      clearGroqApiKey: true,
    });
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toThrow("Configure a chave Groq");
    await updateSettings(database.db, workspaceId, {
      ...settings,
      searchProvider: "gemini",
    });
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toThrow("exige Tavily");
    expect(groq).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(await database.db.select().from(usage).all()).toHaveLength(0);
  });
  it("keeps actual failures in quota and never silently falls back to another provider", async () => {
    const { provider, groq, router, googleClient } = mocks();
    groq.mockRejectedValue(new AppError(429, "Limite Groq"));
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(await database.db.select().from(usage).get()).toMatchObject({
      model: "groq:openai/gpt-oss-120b",
      status: "failed",
    });
    expect(router).not.toHaveBeenCalled();
    expect(googleClient).not.toHaveBeenCalled();
  });
  it("releases only an unused reservation when Tavily is empty", async () => {
    const { provider, groq, search } = mocks();
    search.mockResolvedValue([]);
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toThrow("não retornou fontes");
    expect(search).toHaveBeenCalledTimes(2);
    expect(groq).not.toHaveBeenCalled();
    expect(await database.db.select().from(usage).all()).toHaveLength(0);
  });
  it("records reported Groq consumption when the response is truncated or invalid", async () => {
    const { provider, groq } = mocks();
    groq.mockRejectedValue(
      new GroqResponseError(502, "Groq retornou uma resposta incompleta.", {
        tokens: 789,
        model: "openai/gpt-oss-20b",
      }),
    );
    await expect(
      provider.discoverBusinesses(workspaceId, input),
    ).rejects.toThrow("resposta incompleta");
    expect(await database.db.select().from(usage).get()).toMatchObject({
      model: "groq:openai/gpt-oss-20b",
      tokens: 789,
      status: "failed",
    });
  });
  it("leaves analysis and outreach on Gemini", async () => {
    await updateSettings(database.db, workspaceId, {
      ...settings,
      apiKey: "fake-google",
    });
    const { provider, groq, googleGenerate, search } = mocks();
    googleGenerate
      .mockResolvedValueOnce({
        text: JSON.stringify({
          businessSummary: "Resumo",
          opportunities: [],
          recommendedService: "Site",
          suggestedApproach: "Conversar",
          limitations: [],
        }),
      })
      .mockResolvedValueOnce({ text: '{"text":"Olá, podemos conversar?"}' });
    const evidence = { name: "Empresa", category: "Serviços", audit: null };
    await provider.analyzeBusiness(workspaceId, evidence);
    await provider.generateOutreach(workspaceId, evidence, "Direto", 450);
    expect(googleGenerate).toHaveBeenCalledTimes(2);
    expect(groq).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
  it("does not accept a hidden official-site contradiction from the original full sources", async () => {
    const { provider, groq, search } = mocks();
    const identity = "Imobiliária Aurora em Palhoça, SC. Rua Central, 123.";
    const hiddenWebsite =
      "Imobiliária Aurora site oficial https://aurora.example/.";
    const full =
      identity +
      " padding ".repeat(1200) +
      hiddenWebsite +
      " padding ".repeat(1200);
    search.mockResolvedValue([{ ...documents[0], content: full }]);
    const reference = (value: string) => ({
      value,
      sourceId: 1,
      quote: identity,
    });
    groq.mockResolvedValue({
      text: JSON.stringify({
        name: reference("Imobiliária Aurora"),
        city: reference("Palhoça"),
        address: reference("Rua Central, 123"),
        websiteStatus: "not_found",
      }),
      tokens: 700,
      model: "openai/gpt-oss-120b",
    });
    const report = await provider.researchContacts(workspaceId, {
      name: "Imobiliária Aurora",
      category: "Imobiliárias",
      city: "Palhoça",
      audit: null,
    });
    expect(report.company?.websiteStatus).toBe("inconclusive");
  });
});
describe("bounded literal Groq source excerpts", () => {
  it("bounds serialized source bytes, keeps stable identities and does not mutate originals", () => {
    const sources = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Empresa ${i}`,
      url: `https://example.com/${i}`,
      content:
        'Header "emoji🙂"\n' +
        "padding ".repeat(1800) +
        "Footer contato@empresa.example",
    }));
    const selected = groqResearchDocuments(sources);
    expect(selected).toHaveLength(6);
    expect(Buffer.byteLength(JSON.stringify(selected))).toBeLessThanOrEqual(
      GROQ_DOCUMENT_BYTES,
    );
    expect(selected[0]).toMatchObject({
      id: 1,
      title: sources[0].title,
      url: sources[0].url,
    });
    expect(selected[0].content).toContain("Footer contato@empresa.example");
    expect(sources[0].content).not.toContain("trecho omitido");
    for (const document of selected)
      for (const passage of document.content.split(
        "\n[... trecho omitido ...]\n",
      ))
        expect(sources[document.id - 1].content).toContain(passage);
  });
  it("handles empty results and large source metadata without changing URLs", () => {
    expect(groqResearchDocuments([])).toEqual([]);
    const sources = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      title: "T".repeat(500),
      url: `https://example.com/${"p".repeat(1900)}${i}`,
      content: "Rua Central, 123",
    }));
    const result = groqResearchDocuments(sources);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(6);
    expect(result[0].url).toBe(sources[0].url);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      GROQ_DOCUMENT_BYTES,
    );
  });
});
