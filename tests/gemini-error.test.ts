import { describe, expect, it } from "vitest";
import { geminiError } from "../apps/api/src/providers/gemini-error.js";

describe("Diagnóstico Gemini sem expor segredos", () => {
  it("separa a quota da ferramenta dos tokens", () => {
    const error = geminiError({
      status: 429,
      message: JSON.stringify({
        error: {
          details: [
            {
              quotaMetric: "generate_content_search_requests",
              quotaValue: "0",
            },
          ],
        },
      }),
    });
    expect(error.message).toContain("pesquisa Google");
    expect(error.message).toContain("quota disponível: zero");
  });
  it("identifica erro de parâmetro sem publicar o payload original", () => {
    const error = geminiError({
      status: 400,
      message: "temperature rejected; key=secret-test",
    });
    expect(error.message).toContain("HTTP 400");
    expect(error.message).not.toContain("secret-test");
  });
  it("distingue modelo ausente e permissão", () => {
    expect(geminiError({ status: 404 }).message).toContain("Modelo Gemini");
    expect(geminiError({ status: 403 }).message).toContain("permissão");
  });
  it("não transforma falha de rede em falta de quota", () => {
    expect(geminiError(new Error("fetch failed")).message).toContain(
      "não é possível concluir",
    );
  });
  it("identifica a dimensão da quota em mensagens SDK com prefixo sem expor o restante", () => {
    const error = geminiError({
      status: 429,
      message:
        "API Error: " +
        JSON.stringify({
          error: {
            code: 429,
            details: [
              {
                violations: [
                  {
                    quotaId:
                      "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                    quotaValue: "20",
                  },
                  {
                    quotaId:
                      "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
                    quotaValue: "5",
                  },
                ],
              },
            ],
          },
        }) +
        " key=secret-test",
    });
    expect(error.message).toContain("20 chamadas por dia");
    expect(error.message).toContain("5 chamadas por minuto");
    expect(error.message).not.toContain("secret-test");
  });
});
