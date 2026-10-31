import { describe, it, expect } from "vitest";
import { leadInput, searchInput, analysisSchema } from "@jotage/shared";
import {
  normalizePhone,
  calculateScore,
  whatsappLink,
} from "../apps/api/src/services/leads.js";
import {
  isPublicAddress,
  validateDestination,
} from "../apps/api/src/security/http.js";
import { normalizeResults } from "../apps/api/src/providers/overpass.js";
import { parsePage, WebsiteAuditor } from "../apps/api/src/services/audit.js";
import {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
} from "../apps/api/src/security/crypto.js";

describe("Validações e dados desconhecidos", () => {
  it("rejeita nome vazio e parâmetros de descoberta amplos", () => {
    expect(leadInput.safeParse({ name: "" }).success).toBe(false);
    expect(searchInput.safeParse({ radiusKm: 200 }).success).toBe(false);
    expect(searchInput.safeParse({ category: "[out:json]" }).success).toBe(
      false,
    );
  });
  it("preserva ausência de dados e origem na normalização", () => {
    const result = normalizeResults(
      {
        elements: [
          {
            type: "node",
            id: 1,
            tags: { name: "Empresa fictícia" },
            lat: -27,
            lon: -48,
          },
        ],
      },
      searchInput.parse({}),
    );
    expect(result[0].phone).toBeNull();
    expect(result[0].website).toBeNull();
    expect(result[0].city).toBeNull();
    expect(result[0].sourceId).toBe("node/1");
  });
  it("não transforma site desconhecido em oportunidade comprovada", () => {
    const score = calculateScore(
      leadInput.parse({ name: "Empresa" }),
      undefined,
    );
    expect(score.value).toBeNull();
    expect(score.status).toBe("insufficient");
    expect(score.factors[0].points).toBe(0);
  });
  it("produz score reproduzível a partir do HTML", () => {
    const audit = parsePage({
      url: "https://example.com",
      status: 200,
      contentType: "text/html",
      text: "<html><body>Teste</body></html>",
    });
    const input = leadInput.parse({ name: "Empresa", category: "Serviços" });
    const a = calculateScore(input, audit),
      b = calculateScore(input, audit);
    expect(a.value).toBe(b.value);
    expect(
      a.factors.find((f) => f.label === "Problemas técnicos")?.points,
    ).toBe(25);
    expect(a.value).toBeLessThanOrEqual(100);
  });
  it("rejeita saída de IA incompleta", () => {
    expect(analysisSchema.safeParse({ businessSummary: "Texto" }).success).toBe(
      false,
    );
  });
});
describe("Auditoria e segurança", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "224.0.0.1",
    "100.64.0.1",
  ])("bloqueia endereço %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it("aceita endereço público", () =>
    expect(isPublicAddress("93.184.216.34")).toBe(true));
  it.each([
    "file:///etc/passwd",
    "http://localhost",
    "http://127.0.0.1",
    "http://2130706433",
    "https://user:pass@example.com",
    "https://example.com:22",
  ])("rejeita URL %s", async (url) => {
    await expect(validateDestination(url)).rejects.toThrow();
  });
  it("não executa scripts nem presume responsividade", () => {
    const result = parsePage({
      status: 200,
      url: "https://example.com",
      contentType: "text/html",
      text: '<title>Exemplo</title><meta name="viewport" content="width=device-width"><h1>Teste</h1><a href="mailto:contato@example.com">Contato</a>',
    });
    expect(result.viewport).toBe(true);
    expect(result.contactLinks).toBe(1);
    expect(result.limitations.join(" ")).toContain("não foram testados");
  });
  it("respeita robots.txt e site não informado", async () => {
    const auditor = new WebsiteAuditor(async (url) => ({
      status: 200,
      url,
      contentType: "text/plain",
      text: "User-agent: *\nDisallow: /",
    }));
    expect((await auditor.audit(null)).status).toBe("not_informed");
    expect((await auditor.audit("https://example.com")).status).toBe(
      "unavailable",
    );
  });
  it("criptografa segredos e valida senha scrypt", async () => {
    const secret = "x".repeat(40),
      encrypted = encrypt("chave-teste", secret);
    expect(encrypted).not.toContain("chave-teste");
    expect(decrypt(encrypted, secret)).toBe("chave-teste");
    const hash = await hashPassword("senha de teste longa");
    expect(await verifyPassword("senha de teste longa", hash)).toBe(true);
    expect(await verifyPassword("errada", hash)).toBe(false);
  });
});
describe("WhatsApp", () => {
  it("normaliza número de teste sem acionar rede", () => {
    expect(normalizePhone("(11) 99999-9999")).toBe("5511999999999");
    expect(normalizePhone("123")).toBeNull();
  });
  it("codifica mensagem e rejeita contato inválido", () => {
    expect(whatsappLink("5511999999999", "Olá & teste")).toContain(
      "text=Ol%C3%A1%20%26%20teste",
    );
    expect(() => whatsappLink(null, "Olá")).toThrow();
  });
});
