import { afterEach, expect, it, vi } from "vitest";
import { api } from "../apps/web/src/lib/api";

afterEach(() => vi.unstubAllGlobals());

it("explica API ausente quando o servidor retorna texto em vez de JSON", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("The page could not be found", { status: 404 }),
      ),
  );
  await expect(api("/auth/me")).rejects.toThrow("backend conectado");
});

it("trata JSON malformado sem expor erro do parser", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("invalid", {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
      ),
  );
  await expect(api("/auth/me")).rejects.toThrow("resposta inválida");
});

it("preserva o status e a mensagem de autenticação da API", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Acesso negado" }, { status: 401 }),
      ),
  );
  await expect(api("/auth/me")).rejects.toMatchObject({
    status: 401,
    message: "Acesso negado",
  });
});
