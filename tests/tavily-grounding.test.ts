import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { searchInput } from "@jotage/shared";
import {
  externalContactReport,
  externalDiscovery,
} from "../apps/api/src/providers/external-grounded-businesses.js";
import { GeminiProvider } from "../apps/api/src/providers/gemini.js";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { workspaces, usage } from "../apps/api/src/database/schema.js";
import { defaults, updateSettings } from "../apps/api/src/services/settings.js";
import { config } from "../apps/api/src/config.js";

const input = searchInput.parse({
  city: "Palhoça",
  state: "SC",
  latitude: -27.645,
  longitude: -48.669,
  radiusKm: 50,
  limit: 10,
});
const content =
  "Oficina Aurora — Rua Central, 123, Palhoça, SC. Telefone (48) 3222-3333. contato@aurora.example. Site oficial https://aurora.example/. Coordenadas -27.645, -48.669.";
const documents = [
  {
    id: 1,
    title: "Oficina Aurora – Contato",
    url: "https://aurora.example/contato",
    content,
  },
];
const cite = <T>(value: T, quote = content, sourceId = 1) => ({
  value,
  quote,
  sourceId,
});
const business = (quote = content) => ({
  name: cite("Oficina Aurora", quote),
  websiteStatus: "has_website",
  website: cite("https://aurora.example/", quote),
  city: cite("Palhoça", quote),
  state: cite("SC", quote),
  address: cite("Rua Central, 123", quote),
  phone: cite("(48) 3222-3333", quote),
  email: cite("contato@aurora.example", quote),
  latitude: cite(-27.645, quote),
  longitude: cite(-48.669, quote),
});
const report = (
  value: unknown,
  docs = documents,
  expected = {
    name: "Oficina Aurora",
    city: "Palhoça",
    address: "Rua Central, 123",
  },
) => externalContactReport(JSON.stringify(value), docs, expected);

describe("evidências externas sem grounding Google inventado", () => {
  it("extrai identidade, endereço, contatos e coordenadas a partir de trechos reais", () => {
    const result = externalDiscovery(
      JSON.stringify({ businesses: [business()] }),
      documents,
      input,
    );
    expect(result.leads[0]).toMatchObject({
      name: "Oficina Aurora",
      city: "Palhoça",
      phone: "554832223333",
      email: "contato@aurora.example",
      website: "https://aurora.example/",
      latitude: -27.645,
      source: "Tavily + Gemini",
    });
    expect(result.report.sources).toEqual([
      { title: documents[0].title, url: documents[0].url, provider: "Tavily" },
    ]);
    expect(result.report.searchSuggestions).toBeUndefined();
    expect(report(business()).company?.websiteStatus).toBe("has_website");
  });
  it("descarta valor inventado mesmo em uma citação válida e rejeita citação inexistente", () => {
    const raw = {
      ...business(),
      phone: cite("(48) 99999-0000"),
      email: cite("inventado@aurora.example"),
      website: cite("https://inventado.example/"),
      latitude: cite(27.645),
    };
    const result = report(raw);
    expect(result.company).toMatchObject({
      phone: null,
      email: null,
      website: null,
      websiteStatus: "inconclusive",
    });
    const fake = {
      ...business(),
      name: cite("Oficina Aurora", "Oficina Aurora telefone imaginado"),
    };
    expect(report(fake).company?.websiteStatus).toBe("inconclusive");
    expect(() =>
      externalDiscovery(
        JSON.stringify({ businesses: [fake] }),
        documents,
        input,
      ),
    ).toThrow("identidade e localização");
  });
  it("não atribui contatos de outra empresa em uma lista e distingue cidades/filiais", () => {
    const docs = [
      {
        id: 1,
        title: "Lista de oficinas",
        url: "https://diretorio.example/",
        content: content + " Oficina Norte – (48) 98888-7777",
      },
    ];
    const raw = {
      ...business(),
      phone: cite("(48) 98888-7777", "Oficina Norte – (48) 98888-7777"),
    };
    expect(report(raw, docs).company?.phone).toBeNull();
    expect(
      report(business(), documents, {
        name: "Oficina Aurora",
        city: "São José",
        address: "Outra rua",
      }).company?.websiteStatus,
    ).toBe("inconclusive");
  });
  it("não estima coordenadas e mantém apenas endereço confirmado na cidade solicitada", () => {
    const raw = {
      ...business(),
      latitude: cite(-27.64),
      longitude: cite(-48.66),
    };
    const result = externalDiscovery(
      JSON.stringify({ businesses: [raw] }),
      documents,
      input,
    );
    expect(result.leads[0].latitude).toBeNull();
    expect(result.leads[0].longitude).toBeNull();
    expect(result.leads[0].notes).toContain(
      "Distância exata precisa de revisão",
    );
    expect(() =>
      externalDiscovery(JSON.stringify({ businesses: [raw] }), documents, {
        ...input,
        city: "São José",
      }),
    ).toThrow("localização");
  });
  it("informa apenas contagens das causas de rejeição, sem nomes nem contatos", () => {
    const farContent = content.replace("-27.645, -48.669", "-23.55, -46.63");
    const farDocument = { ...documents[0], id: 2, content: farContent };
    const farBusiness = Object.fromEntries(
      Object.entries(business(farContent)).map(([key, value]) => [
        key,
        typeof value === "object" ? { ...value, sourceId: 2 } : value,
      ]),
    );
    farBusiness.latitude = cite(-23.55, farContent, 2);
    farBusiness.longitude = cite(-46.63, farContent, 2);
    const invalidIdentity = {
      ...business(),
      name: cite("Oficina Aurora", "Trecho inventado sobre Oficina Aurora"),
    };
    const invalidLocality = {
      ...business(),
      address: null,
      latitude: null,
      longitude: null,
    };
    try {
      externalDiscovery(
        JSON.stringify({
          businesses: [invalidIdentity, invalidLocality, farBusiness],
        }),
        [...documents, farDocument],
        input,
      );
      expect.fail("A busca deveria rejeitar os três candidatos");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("Avaliadas: 3");
      expect(message).toContain("sem identidade ou trecho verificável: 1");
      expect(message).toContain("sem endereço/cidade verificáveis: 1");
      expect(message).toContain("fora do raio: 1");
      expect(message).not.toContain("Oficina Aurora");
      expect(message).not.toContain("contato@aurora.example");
    }
  });
  it("not_found exige identidade/endereço/cidade verificados e rede social não vira site próprio", () => {
    const noSiteContent = content.replace(
      " Site oficial https://aurora.example/.",
      "",
    );
    const noSiteDocuments = [
      {
        ...documents[0],
        url: "https://diretorio.example/oficina-aurora",
        content: noSiteContent,
      },
    ];
    const raw = {
      ...business(noSiteContent),
      websiteStatus: "not_found",
      website: null,
    };
    expect(report(raw, noSiteDocuments).company?.websiteStatus).toBe(
      "not_found",
    );
    expect(
      report({ ...raw, address: null }, noSiteDocuments).company?.websiteStatus,
    ).toBe("inconclusive");
    expect(
      report(
        { ...raw, city: cite("Palhoça", noSiteContent, 99) },
        noSiteDocuments,
      ).company?.websiteStatus,
    ).toBe("inconclusive");
    const social = {
      ...documents[0],
      content: content + " https://instagram.com/oficinaaurora",
    };
    expect(
      report(
        {
          ...business(),
          website: cite("https://instagram.com/oficinaaurora", social.content),
        },
        [social],
      ).company,
    ).toMatchObject({ website: null, websiteStatus: "inconclusive" });
  });
  it.each(["Site oficial", "Site:", "Website:"])(
    "não aprova not_found contradito por %s nos documentos reais",
    (label) => {
      const document = {
        ...documents[0],
        content: content.replace("Site oficial", label),
      };
      // Keep citations valid while the model omits the website from its JSON.
      const raw = {
        ...business(document.content),
        websiteStatus: "not_found",
        website: null,
      };
      const result = report(raw, [document]);
      expect(result.company?.websiteStatus).toBe("inconclusive");
      expect(result.company?.website).toBeNull();
      expect(result.text).not.toContain("SITE_NAO_LOCALIZADO");
    },
  );
});

let database: Awaited<ReturnType<typeof openDatabase>> | undefined;
afterEach(() => {
  database?.sqlite.close();
  database = undefined;
});
it("Tavily pesquisa e Gemini 3.8 organiza sem ferramentas Google, usando teto diário e tokens reais", async () => {
  database = await openDatabase(":memory:");
  const workspace = { ...stamp(), name: "Tavily teste" };
  await database.db.insert(workspaces).values(workspace).run();
  config.secret = "tavily-test-secret".repeat(3);
  await updateSettings(database.db, workspace.id, {
    ...defaults,
    searchProvider: "tavily",
    model: "gemini-3.8-flash",
    researchModel: "gemini-3.8-flash",
    apiKey: "gemini-test-key",
    tavilyApiKey: "tavily-test-key",
    dailyLimit: 2,
  });
  const generate = vi
    .fn()
    .mockResolvedValueOnce({
      text: JSON.stringify({ businesses: [business()] }),
      usageMetadata: { totalTokenCount: 1234 },
    })
    .mockResolvedValueOnce({ text: JSON.stringify(business()) });
  const search = vi.fn().mockResolvedValue(documents);
  const provider = new GeminiProvider(
    database.db,
    () => ({ models: { generateContent: generate } }) as unknown as GoogleGenAI,
    search,
  );
  await provider.discoverBusinesses(workspace.id, input);
  await provider.researchContacts(workspace.id, {
    name: "Oficina Aurora",
    category: "Oficinas",
    city: "Palhoça",
    audit: null,
  });
  const request = generate.mock.calls[0][0];
  expect(request.model).toBe("gemini-3.8-flash");
  expect(request.config.tools).toBeUndefined();
  expect(request.config.toolConfig).toBeUndefined();
  expect(request.config.responseMimeType).toBe("application/json");
  expect(request.config.responseJsonSchema).toBeUndefined();
  expect(request.config.systemInstruction).toContain('"sourceId"');
  expect(request.config.systemInstruction).toContain('"businesses"');
  expect(request.config.thinkingConfig.thinkingLevel).toBe("HIGH");
  expect(request.config.maxOutputTokens).toBe(32768);
  expect(JSON.parse(request.contents).documents).toEqual(documents);
  expect(search.mock.calls[0][0]).toBe("tavily-test-key");
  expect(search.mock.calls[0][1]).toBe(
    `${input.category} "Palhoça" SC endereço telefone site contato`,
  );
  expect(search.mock.calls[0][1]).not.toContain("Google Maps");
  expect(search.mock.calls[1][1]).toContain("site oficial");
  expect(search.mock.calls[1][1]).not.toContain("Google Maps");
  expect(
    (await database.db.select().from(usage).all()).find(
      (row) => row.tokens === 1234,
    )?.status,
  ).toBe("completed");
  await expect(
    provider.discoverBusinesses(workspace.id, input),
  ).rejects.toMatchObject({ statusCode: 429 });
  expect(search).toHaveBeenCalledTimes(2);
  expect(generate).toHaveBeenCalledTimes(2);
});
