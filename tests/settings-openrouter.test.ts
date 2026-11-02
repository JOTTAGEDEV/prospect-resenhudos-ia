import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { settingsInput } from "@jotage/shared";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { settings, workspaces } from "../apps/api/src/database/schema.js";
import { config } from "../apps/api/src/config.js";
import {
  defaults,
  getApiKey,
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
  config.secret = "openrouter-settings-test-secret-32-characters";
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("TAVILY_API_KEY", "");
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

it("criptografa OpenRouter separadamente e não retorna nenhum segredo", async () => {
  const result = await updateSettings(database.db, workspaceId, {
    ...defaults,
    researchProvider: "openrouter",
    searchProvider: "tavily",
    apiKey: "gemini-test-only",
    tavilyApiKey: "tavily-test-only",
    openrouterApiKey: "openrouter-test-only",
    openrouterConfigured: true,
  });
  const row = (await database.db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get())!;
  expect(row.encryptedOpenRouterKey).toBeTruthy();
  expect(row.encryptedOpenRouterKey).not.toContain("openrouter-test-only");
  expect(JSON.stringify(row.data)).not.toMatch(
    /test-only|openrouterApiKey|clearOpenrouterApiKey|openrouterConfigured/,
  );
  expect(result).toMatchObject({
    researchProvider: "openrouter",
    openrouterConfigured: true,
    aiConfigured: true,
    searchConfigured: true,
  });
  expect(JSON.stringify(result)).not.toMatch(
    /test-only|openrouterApiKey|clearOpenrouterApiKey/,
  );
  expect(await getOpenRouterApiKey(database.db, workspaceId)).toBe(
    "openrouter-test-only",
  );
  expect(await getApiKey(database.db, workspaceId)).toBe("gemini-test-only");
  expect(await getSearchApiKey(database.db, workspaceId)).toBe(
    "tavily-test-only",
  );
});

it("preserva chave e opção de pesquisa em cliente antigo e isola a remoção", async () => {
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    researchProvider: "openrouter",
    openrouterModel: "example/model:free",
    openrouterApiKey: "original-test-key",
    apiKey: "gemini-test-key",
  });
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    researchProvider: undefined,
    openrouterModel: undefined,
    openrouterApiKey: "  ",
  });
  expect(await getOpenRouterApiKey(database.db, workspaceId)).toBe(
    "original-test-key",
  );
  expect(await getSettings(database.db, workspaceId)).toMatchObject({
    researchProvider: "openrouter",
    openrouterModel: "example/model:free",
  });
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    clearOpenrouterApiKey: true,
  });
  expect(await getOpenRouterApiKey(database.db, workspaceId)).toBe("");
  expect(await getApiKey(database.db, workspaceId)).toBe("gemini-test-key");
  expect(
    (await getSettings(database.db, workspaceId)).openrouterConfigured,
  ).toBe(false);
});

it("isola workspaces e usa a chave de ambiente sem expô-la", async () => {
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    openrouterApiKey: "workspace-key-test",
  });
  expect(await getOpenRouterApiKey(database.db, otherId)).toBe("");
  vi.stubEnv("OPENROUTER_API_KEY", "environment-key-test");
  expect(await getOpenRouterApiKey(database.db, otherId)).toBe(
    "environment-key-test",
  );
  expect(await getOpenRouterApiKey(database.db, workspaceId)).toBe(
    "workspace-key-test",
  );
  expect(JSON.stringify(await getSettings(database.db, otherId))).not.toContain(
    "environment-key-test",
  );
});

it("o contrato aceita somente modelos gratuitos do OpenRouter", () => {
  expect(
    settingsInput.parse({ ...defaults, openrouterModel: "openrouter/free" })
      .openrouterModel,
  ).toBe("openrouter/free");
  expect(
    settingsInput.parse({
      ...defaults,
      openrouterModel: "example/model-v1:free",
    }).openrouterModel,
  ).toBe("example/model-v1:free");
  expect(() =>
    settingsInput.parse({ ...defaults, openrouterModel: "openai/paid-model" }),
  ).toThrow();
  expect(() =>
    settingsInput.parse({
      ...defaults,
      openrouterModel: "openrouter/free:online",
    }),
  ).toThrow();
});
