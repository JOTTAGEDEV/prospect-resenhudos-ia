import { describe, expect, it, vi } from "vitest";
import {
  searchTavily,
  TAVILY_MAX_BYTES,
} from "../apps/api/src/providers/tavily.js";

describe("Tavily HTTP", () => {
  it("usa apenas uma busca básica, sem upgrade automático, e filtra links executáveis", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Empresa",
              url: "https://empresa.example/",
              content: "Dados públicos",
            },
            {
              title: "Duplicado",
              url: "https://empresa.example/",
              content: "Duplicado",
            },
            {
              title: "Inseguro",
              url: "javascript:alert(1)",
              content: "Instruções",
            },
            {
              title: "Credenciais",
              url: "https://user:pass@empresa.example/",
              content: "Outro",
            },
          ],
        }),
      ),
    );
    const result = await searchTavily(
      "test-only-key",
      "Hotéis Palhoça",
      50,
      undefined,
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(request.headers.Authorization).toBe("Bearer test-only-key");
    expect(request.redirect).toBe("error");
    expect(JSON.parse(request.body)).toMatchObject({
      search_depth: "basic",
      auto_parameters: false,
      max_results: 20,
      include_raw_content: "markdown",
    });
    expect(result).toEqual([
      {
        id: 1,
        title: "Empresa",
        url: "https://empresa.example/",
        content: "Dados públicos",
      },
    ]);
  });
  it("inclui endereço e contatos do conteúdo completo e mantém resumo com raw nulo ou ausente", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Empresa",
              url: "https://empresa.example/",
              content: "Resumo sem contatos",
              raw_content:
                "# Empresa\nRua Central, 123, Palhoça\n(48) 3222-3333\ncontato@empresa.example",
            },
            {
              title: "Outra",
              url: "https://outra.example/",
              content: "Resumo disponível",
              raw_content: null,
            },
            {
              title: "Terceira",
              url: "https://terceira.example/",
              content: "Resumo antigo",
            },
          ],
        }),
      ),
    );
    const result = await searchTavily(
      "test-key",
      "teste",
      20,
      undefined,
      fetcher,
    );
    expect(result[0].content).toContain("Resumo sem contatos");
    expect(result[0].content).toContain("Rua Central, 123, Palhoça");
    expect(result[0].content).toContain("(48) 3222-3333");
    expect(result[0].content).toContain("contato@empresa.example");
    expect(result[1].content).toBe("Resumo disponível");
    expect(result[2].content).toBe("Resumo antigo");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("limita documentos a 16 mil caracteres preservando início e contatos no rodapé", async () => {
    const raw =
      "Empresa Aurora em Palhoça\n" +
      "conteúdo intermediário ".repeat(3000) +
      "\nRodapé: Rua Central, 123; (48) 3222-3333; contato@aurora.example";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Empresa",
              url: "https://empresa.example/",
              content: "Resumo ".repeat(1000),
              raw_content: raw,
            },
            {
              title: "Outra",
              url: "https://outra.example/",
              content: "s".repeat(20_000),
              raw_content: null,
            },
          ],
        }),
      ),
    );
    const result = await searchTavily(
      "test-key",
      "teste",
      20,
      undefined,
      fetcher,
    );
    expect(result[0].content).toHaveLength(16_000);
    expect(result[0].content).toContain("Empresa Aurora em Palhoça");
    expect(result[0].content).toContain("Rodapé: Rua Central, 123");
    expect(result[0].content).toContain("contato@aurora.example");
    expect(result[0].content).toContain("trecho intermediário omitido");
    expect(result[1].content).toHaveLength(16_000);
  });
  it.each([
    [401, 409],
    [403, 409],
    [429, 429],
    [432, 429],
    [433, 429],
    [500, 502],
  ])(
    "traduz status %i sem expor resposta ou chave",
    async (status, statusCode) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response("secret-provider-key", { status }));
      await expect(
        searchTavily("secret-input-key", "teste", 10, undefined, fetcher),
      ).rejects.toMatchObject({ statusCode });
      await expect(
        searchTavily(
          "secret-input-key",
          "teste",
          10,
          undefined,
          vi.fn().mockRejectedValue(new Error("secret-input-key")),
        ),
      ).rejects.not.toThrow("secret-input-key");
    },
  );
  it("não consulta sem chave e rejeita JSON/respostas grandes", async () => {
    const fetcher = vi.fn();
    await expect(
      searchTavily(" ", "teste", 10, undefined, fetcher),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      searchTavily(
        "test",
        "teste",
        10,
        undefined,
        vi.fn().mockResolvedValue(new Response("invalid")),
      ),
    ).rejects.toThrow("resposta inválida");
    const large = new Response("x".repeat(TAVILY_MAX_BYTES + 1));
    await expect(
      searchTavily(
        "test",
        "teste",
        10,
        undefined,
        vi.fn().mockResolvedValue(large),
      ),
    ).rejects.toThrow("tamanho permitido");
  });
});
