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
      include_raw_content: false,
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
