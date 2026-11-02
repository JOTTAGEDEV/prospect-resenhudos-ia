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
  researchProvider: "gemini",
  openrouterModel: "openrouter/free",
  groqModel: "openai/gpt-oss-120b",
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
    openrouterApiKey: _openrouterApiKey,
    clearOpenrouterApiKey: _clearOpenrouterApiKey,
    groqApiKey: _groqApiKey,
    clearGroqApiKey: _clearGroqApiKey,
    groqConfigured: _groqConfigured,
    ...data
  } = row?.data || {};
  return {
    ...defaults,
    ...data,
    aiConfigured: !!(row?.encryptedKey || process.env.GEMINI_API_KEY),
    searchConfigured: !!(row?.encryptedSearchKey || process.env.TAVILY_API_KEY),
    openrouterConfigured: !!(
      row?.encryptedOpenRouterKey || process.env.OPENROUTER_API_KEY
    ),
    groqConfigured: !!(row?.encryptedGroqKey || process.env.GROQ_API_KEY),
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
    openrouterApiKey,
    clearOpenrouterApiKey,
    openrouterConfigured: _openrouterConfigured,
    groqApiKey,
    clearGroqApiKey,
    groqConfigured: _groqConfigured,
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
    researchProvider:
      data.researchProvider ??
      row?.data.researchProvider ??
      defaults.researchProvider,
    researchModel:
      data.researchModel ?? row?.data.researchModel ?? defaults.researchModel,
    openrouterModel:
      data.openrouterModel ??
      row?.data.openrouterModel ??
      defaults.openrouterModel,
    groqModel: data.groqModel ?? row?.data.groqModel ?? defaults.groqModel,
  };
  const encryptedOpenRouterKey = clearOpenrouterApiKey
    ? null
    : openrouterApiKey?.trim()
      ? encrypt(openrouterApiKey.trim(), config.secret)
      : row?.encryptedOpenRouterKey;
  const encryptedGroqKey = clearGroqApiKey
    ? null
    : groqApiKey?.trim()
      ? encrypt(groqApiKey.trim(), config.secret)
      : row?.encryptedGroqKey;
  if (row)
    await db
      .update(settings)
      .set({
        data: nextData,
        encryptedKey,
        encryptedSearchKey,
        encryptedOpenRouterKey,
        encryptedGroqKey,
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
        encryptedOpenRouterKey,
        encryptedGroqKey,
      })
      .run();
  return await getSettings(db, workspaceId);
}

export async function getOpenRouterApiKey(db: DB, workspaceId: string) {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get();
  return row?.encryptedOpenRouterKey
    ? decrypt(row.encryptedOpenRouterKey, config.secret)
    : process.env.OPENROUTER_API_KEY || "";
}

export async function getGroqApiKey(db: DB, workspaceId: string) {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.workspaceId, workspaceId))
    .get();
  return row?.encryptedGroqKey
    ? decrypt(row.encryptedGroqKey, config.secret)
    : process.env.GROQ_API_KEY || "";
}
