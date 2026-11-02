import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { searchInput } from "@jotage/shared";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { workspaces, usage } from "../apps/api/src/database/schema.js";
import { defaults, updateSettings } from "../apps/api/src/services/settings.js";
import { GeminiProvider } from "../apps/api/src/providers/gemini.js";
import {
  groundedDiscovery,
  structuredContactReport,
} from "../apps/api/src/providers/grounded-businesses.js";
import { config } from "../apps/api/src/config.js";

let database: Awaited<ReturnType<typeof openDatabase>>;
let workspaceId: string;
const input = searchInput.parse({
  city: "Palhoça",
  state: "SC",
  latitude: -27.645,
  longitude: -48.669,
  radiusKm: 5,
  limit: 10,
});
const business = {
  name: "Oficina Aurora",
  city: "Palhoça",
  state: "SC",
  address: "Rua Central, 123",
  websiteStatus: "has_website",
  website: "https://aurora.example/",
  phone: "(48) 3222-3333",
  email: "contato@aurora.example",
  latitude: -27.645,
  longitude: -48.669,
};

beforeEach(async () => {
  database = await openDatabase(":memory:");
  const workspace = { ...stamp(), name: "Descoberta Google" };
  workspaceId = workspace.id;
  await database.db.insert(workspaces).values(workspace).run();
  config.secret = "secret-for-google-tests".repeat(3);
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    model: "gemini-3.8-flash",
    dailyLimit: 100,
    apiKey: "fake-key-for-tests",
  });
});
afterEach(() => database.sqlite.close());
function grounded(data: unknown, evidence?: string): GenerateContentResponse {
  const text = JSON.stringify(data);
  return {
    text,
    usageMetadata: { totalTokenCount: 4321 },
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            {
              maps: {
                title: "Oficina Aurora",
                uri: "https://maps.google.com/?cid=123",
                placeId: "places/test-place",
              },
            },
            {
              web: {
                title: "Oficina Aurora – contato",
                uri: "https://aurora.example/contato",
              },
            },
          ],
          groundingSupports: [
            {
              segment: {
                startIndex: 0,
                endIndex: text.length,
                text: evidence || text,
              },
              groundingChunkIndices: [0, 1],
            },
          ],
          searchEntryPoint: { renderedContent: "<div>Google Search</div>" },
        },
      },
    ],
  } as GenerateContentResponse;
}
function provider(generate: ReturnType<typeof vi.fn>) {
  return new GeminiProvider(
    database.db,
    () => ({ models: { generateContent: generate } }) as unknown as GoogleGenAI,
  );
}

it("busca com Maps e Search, raciocínio alto, orçamento ampliado e localização", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue(grounded({ businesses: [business] }));
  const result = await provider(generate).discoverBusinesses(
    workspaceId,
    input,
  );
  const config = generate.mock.calls[0][0].config;
  expect(config.tools).toEqual([{ googleSearch: {} }, { googleMaps: {} }]);
  expect(config.thinkingConfig).toEqual({ thinkingLevel: "HIGH" });
  expect(config.maxOutputTokens).toBe(32768);
  expect(config).not.toHaveProperty("temperature");
  expect(config).not.toHaveProperty("responseMimeType");
  expect(config.toolConfig.retrievalConfig.latLng).toEqual({
    latitude: input.latitude,
    longitude: input.longitude,
  });
  expect(result.leads[0]).toMatchObject({
    name: business.name,
    phone: "554832223333",
    email: business.email,
    website: business.website,
    city: "Palhoça",
  });
  expect(result.report.sources[0]).toMatchObject({
    title: "Oficina Aurora",
    provider: "Google Maps",
    url: "https://maps.google.com/?cid=123",
  });
  expect(result.report.searchSuggestions).toContain("Google Search");
  expect((await database.db.select().from(usage).get())?.tokens).toBe(4321);
});

it("não persiste contatos que não aparecem nos trechos sustentados pelas fontes", () => {
  const evidence = JSON.stringify({ ...business, phone: null, email: null });
  const result = groundedDiscovery(
    grounded({ businesses: [business] }, evidence),
    input,
  );
  expect(result.leads[0].phone).toBeNull();
  expect(result.leads[0].email).toBeNull();
  expect(result.leads[0].website).toBe(business.website);
});

it("não inventa coordenadas; exige endereço e cidade identificados quando ausentes", () => {
  const withoutCoordinates = { ...business, latitude: null, longitude: null };
  const result = groundedDiscovery(
    grounded({ businesses: [withoutCoordinates] }),
    input,
  );
  expect(result.leads[0].latitude).toBeNull();
  expect(result.leads[0].notes).toContain("Distância exata precisa de revisão");
  expect(() =>
    groundedDiscovery(
      grounded({
        businesses: [{ ...withoutCoordinates, city: "Outra cidade" }],
      }),
      input,
    ),
  ).toThrow("localização comprovadas");
});

it("descarta coordenadas comprovadas fora do raio e duplicatas", () => {
  const result = groundedDiscovery(
    grounded({
      businesses: [
        business,
        business,
        {
          ...business,
          name: "Unidade distante",
          latitude: -23.55,
          longitude: -46.63,
        },
      ],
    }),
    input,
  );
  expect(result.leads).toHaveLength(1);
});

it("rejeita descoberta sem grounding e registra a falha", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue({ text: JSON.stringify({ businesses: [business] }) });
  await expect(
    provider(generate).discoverBusinesses(workspaceId, input),
  ).rejects.toThrow("fontes verificáveis");
  expect((await database.db.select().from(usage).get())?.status).toBe("failed");
});

it("rejeita estrutura inválida e empresa sem evidência de identidade", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue(
      grounded({ businesses: [{ ...business, email: "invalid" }] }),
    );
  await expect(
    provider(generate).discoverBusinesses(workspaceId, input),
  ).rejects.toThrow("estrutura inválida");
  const unknown = grounded(
    { businesses: [business] },
    "Outra empresa em outro lugar",
  );
  unknown.candidates![0].groundingMetadata!.groundingChunks![0].maps!.title =
    "Outra empresa";
  unknown.candidates![0].groundingMetadata!.groundingChunks![1].web!.title =
    "Outra empresa";
  expect(() => groundedDiscovery(unknown, input)).toThrow("identidade");
});

it("enriquece contatos e mantém uma conclusão prudente para homônimos", () => {
  const result = structuredContactReport(grounded(business), {
    name: business.name,
    city: business.city,
  });
  expect(result.company).toMatchObject({
    websiteStatus: "has_website",
    website: business.website,
    phone: business.phone,
    mapsUrl: "https://maps.google.com/?cid=123",
  });
  expect(
    structuredContactReport(grounded(business), {
      name: business.name,
      city: "Outra cidade",
    }).company?.websiteStatus,
  ).toBe("inconclusive");
  expect(
    structuredContactReport(
      grounded({ ...business, website: null, websiteStatus: "not_found" }),
      { name: business.name, city: business.city },
    ).text,
  ).toContain("não comprova inexistência");
});

it("preserva a estrutura de domínios e emails ao verificar evidências", () => {
  const altered = {
    ...business,
    website: "https://a-b.com/Contato?id=12",
    email: "foob@ar.com",
  };
  const evidence = JSON.stringify({
    ...business,
    website: "https://ab.com/Contato?id=12",
    email: "foo@bar.com",
  });
  const report = structuredContactReport(grounded(altered, evidence), {
    name: business.name,
    city: business.city,
  });
  expect(report.company?.website).toBeNull();
  expect(report.company?.websiteStatus).toBe("inconclusive");
  expect(report.company?.email).toBeNull();
  expect(
    structuredContactReport(
      grounded(
        { ...business, website: "https://aurora.example/?id=2" },
        JSON.stringify({
          ...business,
          website: "https://aurora.example/?id=1",
        }),
      ),
      { name: business.name, city: business.city },
    ).company?.website,
  ).toBeNull();
});

it("aceita variação de caixa do host/email e telefone formatado, sem inventar coordenadas de sinal oposto", () => {
  const altered = {
    ...business,
    email: "CONTATO@AURORA.EXAMPLE",
    phone: "554832223333",
    website: "https://AURORA.EXAMPLE/",
  };
  const evidence = JSON.stringify({
    ...business,
    latitude: 27.645,
    longitude: 48.669,
  }).replace(/\//g, "\\/");
  const report = structuredContactReport(grounded(altered, evidence), {
    name: business.name,
    city: business.city,
  });
  expect(report.company?.website).toBe(altered.website);
  expect(report.company?.email).toBe(altered.email);
  expect(report.company?.phone).toBe(altered.phone);
  const discovery = groundedDiscovery(
    grounded({ businesses: [business] }, evidence),
    input,
  );
  expect(discovery.leads[0].latitude).toBeNull();
  expect(discovery.leads[0].longitude).toBeNull();
});
