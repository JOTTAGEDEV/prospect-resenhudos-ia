import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { workspaces, usage } from "../apps/api/src/database/schema.js";
import { defaults, updateSettings } from "../apps/api/src/services/settings.js";
import { GeminiProvider } from "../apps/api/src/providers/gemini.js";
import { config } from "../apps/api/src/config.js";
const response = {
  businessSummary: "Resumo baseado em evidências",
  opportunities: [],
  recommendedService: "Revisão",
  suggestedApproach: "Conversar",
  limitations: ["Dados limitados"],
};
let database: Awaited<ReturnType<typeof openDatabase>>;
let workspaceId: string;
beforeEach(async () => {
  database = await openDatabase(":memory:");
  const workspace = { ...stamp(), name: "Teste IA" };
  workspaceId = workspace.id;
  await database.db.insert(workspaces).values(workspace).run();
  config.secret = "secret-only-for-test".repeat(3);
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    model: "model-test-only",
    dailyLimit: 2,
    apiKey: "fake-key-test-only",
  });
});
afterEach(() => {
  database.sqlite.close();
  vi.restoreAllMocks();
});
function provider(generate: ReturnType<typeof vi.fn>) {
  return new GeminiProvider(
    database.db,
    () => ({ models: { generateContent: generate } }) as unknown as GoogleGenAI,
  );
}
describe("Gemini com SDK mockado", () => {
  it("valida saída e registra tokens reais informados pelo mock", async () => {
    const generate = vi.fn().mockResolvedValue({
      text: JSON.stringify(response),
      usageMetadata: { totalTokenCount: 120 },
    });
    const result = await provider(generate).analyzeBusiness(workspaceId, {
      name: "Empresa",
      category: "Serviços",
      audit: null,
    });
    expect(result.businessSummary).toBe(response.businessSummary);
    expect(generate.mock.calls[0][0].config).not.toHaveProperty("temperature");
    expect((await database.db.select().from(usage).get())?.tokens).toBe(120);
    expect(generate.mock.calls[0][0].contents).not.toContain("email");
  });
  it("reserva chamadas e bloqueia acima do teto", async () => {
    const generate = vi
        .fn()
        .mockResolvedValue({ text: JSON.stringify(response) }),
      ai = provider(generate);
    for (let i = 0; i < 2; i++)
      await ai.analyzeBusiness(workspaceId, {
        name: "Empresa",
        category: "Serviços",
        audit: null,
      });
    await expect(
      ai.analyzeBusiness(workspaceId, {
        name: "Empresa",
        category: "Serviços",
        audit: null,
      }),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("trata quota externa sem expor erro ou segredo", async () => {
    const ai = provider(
      vi.fn().mockRejectedValue({ status: 429, message: "secret-key" }),
    );
    await expect(
      ai.analyzeBusiness(workspaceId, {
        name: "Empresa",
        category: "Serviços",
        audit: null,
      }),
    ).rejects.toThrow("Quota do Gemini");
    expect((await database.db.select().from(usage).get())?.status).toBe(
      "failed",
    );
  });
  it("descarta JSON malformado", async () => {
    const ai = provider(vi.fn().mockResolvedValue({ text: "não é JSON" }));
    await expect(
      ai.analyzeBusiness(workspaceId, {
        name: "Empresa",
        category: "Serviços",
        audit: null,
      }),
    ).rejects.toThrow("estrutura inválida");
  });
  it("rejeita mensagem acima do comprimento", async () => {
    const ai = provider(
      vi
        .fn()
        .mockResolvedValue({ text: JSON.stringify({ text: "a".repeat(451) }) }),
    );
    await expect(
      ai.generateOutreach(
        workspaceId,
        { name: "Empresa", category: "Serviços", audit: null },
        "Direto",
        450,
      ),
    ).rejects.toThrow("estrutura inválida");
  });
  it("não permite fonte inventada com confiança alta", async () => {
    const ai = provider(
      vi.fn().mockResolvedValue({
        text: JSON.stringify({
          ...response,
          opportunities: [
            {
              title: "Problema",
              description: "Descrição",
              evidence: "Algo",
              sourceUrl: "https://inventado.example",
              confidence: "high",
              suggestedService: "Site",
            },
          ],
        }),
      }),
    );
    await expect(
      ai.analyzeBusiness(workspaceId, {
        name: "Empresa",
        category: "Serviços",
        audit: null,
      }),
    ).rejects.toThrow("fonte não verificada");
  });
});

describe("Pesquisa de contatos com fontes", () => {
  it("ativa Google Search, mantém referências e respeita a quota", async () => {
    const text = JSON.stringify({
      name: "Empresa",
      city: "Palhoça",
      websiteStatus: "has_website",
      website: "https://example.com",
    });
    const generate = vi.fn().mockResolvedValue({
      text,
      usageMetadata: { totalTokenCount: 95 },
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://example.com", title: "Empresa" } },
            ],
            groundingSupports: [
              {
                segment: { endIndex: text.length },
                groundingChunkIndices: [0],
              },
            ],
            searchEntryPoint: { renderedContent: "<div>Google</div>" },
          },
        },
      ],
    });
    const result = await provider(generate).researchContacts(workspaceId, {
      name: "Empresa",
      category: "Hotéis",
      city: "Palhoça",
      audit: null,
    });
    expect(generate.mock.calls[0][0].config.tools).toEqual([
      { googleSearch: {} },
    ]);
    expect(generate.mock.calls[0][0].config.responseMimeType).toBeUndefined();
    expect(result.sources[0].url).toBe("https://example.com");
    expect(result.company?.website).toBe("https://example.com");
    expect(result.searchSuggestions).toContain("Google");
    expect((await database.db.select().from(usage).get())?.tokens).toBe(95);
  });
  it("rejeita contatos sem comprovação de pesquisa na web", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Telefone imaginado" });
    await expect(
      provider(generate).researchContacts(workspaceId, {
        name: "Empresa",
        category: "Serviços",
        audit: null,
      }),
    ).rejects.toThrow("fontes verificáveis");
    expect((await database.db.select().from(usage).get())?.status).toBe(
      "failed",
    );
  });
  it("não publica links com protocolo executável", async () => {
    const generate = vi.fn().mockResolvedValue({
      text: "Resultado",
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [{ web: { uri: "javascript:alert(1)" } }],
            groundingSupports: [
              { segment: { endIndex: 9 }, groundingChunkIndices: [0] },
            ],
          },
        },
      ],
    });
    await expect(
      provider(generate).researchContacts(workspaceId, {
        name: "Empresa",
        category: "Serviços",
        audit: null,
      }),
    ).rejects.toThrow("fontes verificáveis");
  });
});
