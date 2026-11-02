import { eq } from "drizzle-orm";
import {
  defaultWeights,
  type Settings,
} from "../../../../packages/shared/src/index.js";
import type { DB } from "../database/db.js";
import { stamp } from "../database/db.js";
import { settings } from "../database/schema.js";
import { decrypt, encrypt } from "../security/crypto.js";
import { config } from "../config.js";
export const defaults: Settings = {
  company: "Jotage Dev",
  description: "Desenvolvimento e soluções digitais para empresas.",
  services:
    "Sites institucionais, landing pages, sistemas personalizados, interfaces SaaS, identidade visual e edição de vídeos.",
  tone: "Consultivo",
  model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  researchModel: process.env.GEMINI_RESEARCH_MODEL || "",
  searchProvider: "gemini",
  dailyLimit: Number(process.env.MAX_AI_REQUESTS_PER_DAY || 20),
  city: "Palhoça",
  latitude: -27.645,
  longitude: -48.669,
  radiusKm: 5,
  weights: defaultWeights,
};
export async function getSettings(db: DB, workspaceId: string) {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get();
  const {
    apiKey: _apiKey,
    clearApiKey: _clearApiKey,
    tavilyApiKey: _tavilyApiKey,
    clearTavilyApiKey: _clearTavilyApiKey,
    ...data
  } = row?.data || {};
  return {
    ...defaults,
    ...data,
    aiConfigured: !!(row?.encryptedKey || process.env.GEMINI_API_KEY),
    searchConfigured: !!(row?.encryptedSearchKey || process.env.TAVILY_API_KEY),
  };
}
export async function getApiKey(db: DB, workspaceId: string) {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get();
  return row?.encryptedKey
    ? decrypt(row.encryptedKey, config.secret)
    : process.env.GEMINI_API_KEY || "";
}
export async function getSearchApiKey(db: DB, workspaceId: string) {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get();
  return row?.encryptedSearchKey
    ? decrypt(row.encryptedSearchKey, config.secret)
    : process.env.TAVILY_API_KEY || "";
}
export async function updateSettings(
  db: DB,
  workspaceId: string,
  input: Settings,
) {
  const {
    apiKey,
    clearApiKey,
    aiConfigured: _configured,
    tavilyApiKey,
    clearTavilyApiKey,
    searchConfigured: _searchConfigured,
    ...data
  } = input;
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get();
  const encryptedKey = clearApiKey
    ? null
    : apiKey
      ? encrypt(apiKey, config.secret)
      : row?.encryptedKey;
  const encryptedSearchKey = clearTavilyApiKey
    ? null
    : tavilyApiKey?.trim()
      ? encrypt(tavilyApiKey.trim(), config.secret)
      : row?.encryptedSearchKey;
  const nextData = {
    ...data,
    searchProvider:
      data.searchProvider ??
      row?.data.searchProvider ??
      defaults.searchProvider,
  };
  if (row)
    await db
      .update(settings)
      .set({
        data: nextData,
        encryptedKey,
        encryptedSearchKey,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(settings.workspaceId, workspaceId))
      .run();
  else
    await db
      .insert(settings)
      .values({
        ...stamp(),
        workspaceId,
        data: nextData,
        encryptedKey,
        encryptedSearchKey,
      })
      .run();
  return await getSettings(db, workspaceId);
}
