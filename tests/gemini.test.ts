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
let database: ReturnType<typeof openDatabase>;
let workspaceId: string;
beforeEach(() => {
  database = openDatabase(":memory:");
  const workspace = { ...stamp(), name: "Teste IA" };
  workspaceId = workspace.id;
  database.db.insert(workspaces).values(workspace).run();
  config.secret = "secret-only-for-test".repeat(3);
  updateSettings(database.db, workspaceId, {
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
    expect(database.db.select().from(usage).get()?.tokens).toBe(120);
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
    expect(database.db.select().from(usage).get()?.status).toBe("failed");
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
