import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { settings, workspaces } from "../apps/api/src/database/schema.js";
import { config } from "../apps/api/src/config.js";
import {
  defaults,
  getApiKey,
  getSearchApiKey,
  getSettings,
  updateSettings,
} from "../apps/api/src/services/settings.js";

let database: Awaited<ReturnType<typeof openDatabase>>;
let workspaceId: string;
let otherWorkspaceId: string;
let originalSecret: string;
beforeEach(async () => {
  originalSecret = config.secret;
  config.secret = "settings-search-test-encryption-secret-32-bytes";
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("TAVILY_API_KEY", "");
  database = await openDatabase(":memory:");
  const workspace = { ...stamp(), name: "Busca" };
  const other = { ...stamp(), name: "Outra conta" };
  workspaceId = workspace.id;
  otherWorkspaceId = other.id;
  await database.db.insert(workspaces).values([workspace, other]).run();
});
afterEach(() => {
  database.sqlite.close();
  config.secret = originalSecret;
  vi.unstubAllEnvs();
});

it("criptografa a chave Tavily em coluna própria e nunca a devolve nas configurações", async () => {
  const publicSettings = await updateSettings(database.db, workspaceId, {
    ...defaults,
    searchProvider: "tavily",
    apiKey: "gemini-test-key",
    tavilyApiKey: "tvly-test-key",
    searchConfigured: true,
  });
  const saved = (await database.db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get())!;
  expect(saved.encryptedSearchKey).toBeTruthy();
  expect(saved.encryptedSearchKey).not.toContain("tvly-test-key");
  expect(JSON.stringify(saved.data)).not.toMatch(
    /tvly-test-key|gemini-test-key|tavilyApiKey|clearTavilyApiKey|searchConfigured|aiConfigured/,
  );
  expect(publicSettings).toMatchObject({
    searchProvider: "tavily",
    searchConfigured: true,
    aiConfigured: true,
  });
  expect(publicSettings).not.toHaveProperty("tavilyApiKey");
  expect(publicSettings).not.toHaveProperty("apiKey");
  expect(await getSearchApiKey(database.db, workspaceId)).toBe("tvly-test-key");
  expect(await getApiKey(database.db, workspaceId)).toBe("gemini-test-key");
});

it("preserva cada chave separadamente e mantém o provedor quando um cliente antigo o omite", async () => {
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    searchProvider: "tavily",
    apiKey: "gemini-test-key",
    tavilyApiKey: "tvly-test-key",
  });
  const initial = (await database.db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get())!;
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    searchProvider: undefined,
    company: "Novo nome",
    apiKey: "",
    tavilyApiKey: "  ",
  });
  const preserved = (await database.db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get())!;
  expect(preserved.encryptedKey).toBe(initial.encryptedKey);
  expect(preserved.encryptedSearchKey).toBe(initial.encryptedSearchKey);
  expect((await getSettings(database.db, workspaceId)).searchProvider).toBe(
    "tavily",
  );
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    clearApiKey: true,
  });
  expect(await getApiKey(database.db, workspaceId)).toBe("");
  expect(await getSearchApiKey(database.db, workspaceId)).toBe("tvly-test-key");
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    apiKey: "replacement-gemini",
    clearTavilyApiKey: true,
  });
  expect(await getSearchApiKey(database.db, workspaceId)).toBe("");
  expect(await getApiKey(database.db, workspaceId)).toBe("replacement-gemini");
  expect((await getSettings(database.db, workspaceId)).searchConfigured).toBe(
    false,
  );
});

it("isola as chaves entre workspaces", async () => {
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    tavilyApiKey: "tvly-workspace-one",
  });
  expect(await getSearchApiKey(database.db, otherWorkspaceId)).toBe("");
  expect(
    (await getSettings(database.db, otherWorkspaceId)).searchConfigured,
  ).toBe(false);
  await updateSettings(database.db, otherWorkspaceId, {
    ...defaults,
    tavilyApiKey: "tvly-workspace-two",
  });
  expect(await getSearchApiKey(database.db, workspaceId)).toBe(
    "tvly-workspace-one",
  );
  expect(await getSearchApiKey(database.db, otherWorkspaceId)).toBe(
    "tvly-workspace-two",
  );
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    clearTavilyApiKey: true,
  });
  expect(await getSearchApiKey(database.db, otherWorkspaceId)).toBe(
    "tvly-workspace-two",
  );
});

it("usa o segredo de ambiente como fallback sem expô-lo e prioriza a chave salva", async () => {
  vi.stubEnv("TAVILY_API_KEY", "tvly-environment-test-key");
  expect(await getSearchApiKey(database.db, workspaceId)).toBe(
    "tvly-environment-test-key",
  );
  expect((await getSettings(database.db, workspaceId)).searchConfigured).toBe(
    true,
  );
  expect(
    JSON.stringify(await getSettings(database.db, workspaceId)),
  ).not.toContain("tvly-environment-test-key");
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    tavilyApiKey: "tvly-workspace-priority",
  });
  expect(await getSearchApiKey(database.db, workspaceId)).toBe(
    "tvly-workspace-priority",
  );
  await updateSettings(database.db, workspaceId, {
    ...defaults,
    clearTavilyApiKey: true,
  });
  expect(await getSearchApiKey(database.db, workspaceId)).toBe(
    "tvly-environment-test-key",
  );
  expect((await getSettings(database.db, workspaceId)).searchConfigured).toBe(
    true,
  );
});
