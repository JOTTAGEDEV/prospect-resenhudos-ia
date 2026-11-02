import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { settingsInput } from "@jotage/shared";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { settings, workspaces } from "../apps/api/src/database/schema.js";
import { config } from "../apps/api/src/config.js";
import {
  defaults,
  getApiKey,
  getGroqApiKey,
  getOpenRouterApiKey,
  getSearchApiKey,
  getSettings,
  updateSettings,
} from "../apps/api/src/services/settings.js";

let database: Awaited<ReturnType<typeof openDatabase>>;
let workspaceId: string;
let otherId: string;
let originalSecret: string;
beforeEach(async () => {
  originalSecret = config.secret;
  config.secret = "groq-settings-test-secret-32-characters";
  for (const name of [
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "GEMINI_API_KEY",
    "TAVILY_API_KEY",
  ])
    vi.stubEnv(name, "");
  database = await openDatabase(":memory:");
  const first = { ...stamp(), name: "Primeiro" },
    other = { ...stamp(), name: "Outro" };
  workspaceId = first.id;
  otherId = other.id;
  await database.db.insert(workspaces).values([first, other]).run();
});
afterEach(() => {
  database.sqlite.close();
  config.secret = originalSecret;
  vi.unstubAllEnvs();
});

it("criptografa a chave Groq separadamente e não retorna nem persiste segredos em JSON", async () => {
  const result = await updateSettings(database.db, workspaceId, {
    ...defaults,
    researchProvider: "groq",
    searchProvider: "tavily",
    apiKey: "gemini-test-only",
    tavilyApiKey: "tavily-test-only",
    openrouterApiKey: "openrouter-test-only",
    groqApiKey: "  groq-test-only  ",
    groqConfigured: false,
  });
  const row = (await database.db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get())!;
  expect(row.encryptedGroqKey).toBeTruthy();
  expect(row.encryptedGroqKey).not.toContain("groq-test-only");
  expect(row.encryptedGroqKey).not.toBe(row.encryptedOpenRouterKey);
  expect(JSON.stringify(row.data)).not.toMatch(
    /test-only|ApiKey|apiKey|Configured/,
  );
  expect(result).toMatchObject({
    researchProvider: "groq",
    groqModel: "openai/gpt-oss-120b",
    groqConfigured: true,
    openrouterConfigured: true,
    aiConfigured: true,
    searchConfigured: true,
  });
  expect(JSON.stringify(result)).not.toMatch(/test-only|ApiKey|apiKey/);
  expect(await getGroqApiKey(database.db, workspaceId)).toBe("groq-test-only");
  expect(await getApiKey(database.db, workspaceId)).toBe("gemini-test-only");
  expect(await getSearchApiKey(database.db, workspaceId)).toBe(
    "tavily-test-only",
  );
  expect(await getOpenRouterApiKey(database.db, workspaceId)).toBe(
    "openrouter-test-only",
  );
});

it("preserva a chave Groq e modelos quando um cliente antigo omite campos opcionais", async () => {
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    researchProvider: "groq",
    groqModel: "openai/gpt-oss-20b",
    researchModel: "gemini-backup-test-model",
    openrouterModel: "example/custom:free",
    groqApiKey: "original-test-key",
  });
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    researchProvider: undefined,
    groqModel: undefined,
    researchModel: undefined,
    openrouterModel: undefined,
    groqApiKey: "  ",
  });
  expect(await getGroqApiKey(database.db, workspaceId)).toBe(
    "original-test-key",
  );
  expect(await getSettings(database.db, workspaceId)).toMatchObject({
    researchProvider: "groq",
    groqModel: "openai/gpt-oss-20b",
    researchModel: "gemini-backup-test-model",
    openrouterModel: "example/custom:free",
  });
});

it("mantém a chave Groq quando outras integrações são removidas", async () => {
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    researchProvider: "groq",
    groqApiKey: "groq-preserved-test-key",
    apiKey: "gemini-test-key",
    tavilyApiKey: "tavily-test-key",
    openrouterApiKey: "openrouter-test-key",
  });
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    clearApiKey: true,
    clearTavilyApiKey: true,
    clearOpenrouterApiKey: true,
  });
  expect(await getGroqApiKey(database.db, workspaceId)).toBe(
    "groq-preserved-test-key",
  );
  expect((await getSettings(database.db, workspaceId)).groqConfigured).toBe(
    true,
  );
  expect(await getApiKey(database.db, workspaceId)).toBe("");
  expect(await getSearchApiKey(database.db, workspaceId)).toBe("");
  expect(await getOpenRouterApiKey(database.db, workspaceId)).toBe("");
});

it("remove só a chave Groq e a remoção explícita prevalece sobre uma nova chave", async () => {
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    groqApiKey: "original-test-key",
    apiKey: "gemini-preserved-key",
    tavilyApiKey: "tavily-preserved-key",
    openrouterApiKey: "openrouter-preserved-key",
  });
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    clearGroqApiKey: true,
    groqApiKey: "ignored-test-key",
  });
  expect(await getGroqApiKey(database.db, workspaceId)).toBe("");
  expect((await getSettings(database.db, workspaceId)).groqConfigured).toBe(
    false,
  );
  expect(await getApiKey(database.db, workspaceId)).toBe(
    "gemini-preserved-key",
  );
  expect(await getSearchApiKey(database.db, workspaceId)).toBe(
    "tavily-preserved-key",
  );
  expect(await getOpenRouterApiKey(database.db, workspaceId)).toBe(
    "openrouter-preserved-key",
  );
});

it("isola workspaces, prioriza a chave própria e mantém a chave de ambiente no backend", async () => {
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    groqApiKey: "workspace-test-key",
  });
  expect(await getGroqApiKey(database.db, otherId)).toBe("");
  expect((await getSettings(database.db, otherId)).groqConfigured).toBe(false);
  vi.stubEnv("GROQ_API_KEY", "environment-test-key");
  expect(await getGroqApiKey(database.db, otherId)).toBe(
    "environment-test-key",
  );
  expect(await getGroqApiKey(database.db, workspaceId)).toBe(
    "workspace-test-key",
  );
  expect(await getSettings(database.db, otherId)).toMatchObject({
    groqConfigured: true,
  });
  expect(JSON.stringify(await getSettings(database.db, otherId))).not.toContain(
    "environment-test-key",
  );
});

it("não devolve uma chave Groq indevidamente gravada por um cliente legado", async () => {
  await database.db
    .insert(settings)
    .values({
      ...stamp(),
      workspaceId,
      data: {
        ...defaults,
        groqApiKey: "legacy-test-secret",
        clearGroqApiKey: true,
        groqConfigured: true,
      },
    })
    .run();
  const result = await getSettings(database.db, workspaceId);
  expect(result.groqConfigured).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(
    /legacy-test-secret|groqApiKey|clearGroqApiKey/,
  );
});

it("aceita modelos de texto Groq e rejeita URLs, espaços, ferramentas embutidas e flags de saída", () => {
  for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"])
    expect(
      settingsInput.parse({
        ...defaults,
        researchProvider: "groq",
        groqModel: model,
      }).groqModel,
    ).toBe(model);
  for (const model of [
    "",
    "https://example.com/model",
    "openai/gpt-oss-120b\n",
    "openai/gpt oss",
    "groq/compound",
    "groq/compound-mini",
    "GROQ/COMPOUND",
    "x".repeat(181),
  ])
    expect(() =>
      settingsInput.parse({ ...defaults, groqModel: model }),
    ).toThrow();
  expect(() =>
    settingsInput.parse({ ...defaults, groqConfigured: true }),
  ).toThrow();
  expect(() =>
    settingsInput.parse({ ...defaults, groqApiKey: "x".repeat(513) }),
  ).toThrow();
});
