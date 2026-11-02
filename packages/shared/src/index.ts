import { z } from "zod";

export const stages = [
  "Novo lead",
  "Em análise",
  "Qualificado",
  "Pronto para contato",
  "Contatado",
  "Respondeu",
  "Em negociação",
  "Cliente fechado",
  "Perdido",
  "Não contatar",
] as const;
export const segments = [
  "Oficinas mecânicas",
  "Restaurantes",
  "Imobiliárias",
  "Hotéis",
  "Clínicas",
  "Academias",
  "Barbearias",
  "Salões",
  "Lojas",
  "Serviços",
] as const;
export const stageSchema = z.enum(stages);
const optionalText = z.string().trim().max(500).nullable().optional();
export const leadInput = z
  .object({
    name: z.string().trim().min(2).max(180),
    category: z.string().trim().max(100).default("Serviços"),
    city: optionalText,
    state: z.string().max(2).nullable().optional(),
    address: optionalText,
    website: z
      .url()
      .max(2048)
      .refine((v) => /^https?:\/\//i.test(v), "Use HTTP ou HTTPS")
      .nullable()
      .optional(),
    phone: z.string().max(30).nullable().optional(),
    email: z.email().max(254).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    notes: z.string().max(5000).default(""),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    sourceUrl: z
      .url()
      .max(2048)
      .refine((v) => /^https?:\/\//i.test(v), "Use HTTP ou HTTPS")
      .nullable()
      .optional(),
    source: z.string().max(50).default("manual"),
    sourceId: optionalText,
  })
  .strict();
export const searchInput = z
  .object({
    city: z.string().min(2).max(100).default("Palhoça"),
    state: z.string().length(2).default("SC"),
    latitude: z.number().min(-90).max(90).default(-27.645),
    longitude: z.number().min(-180).max(180).default(-48.669),
    radiusKm: z.number().min(0.1).max(50).default(5),
    category: z.enum(segments).default("Oficinas mecânicas"),
    limit: z.number().int().min(1).max(50).default(20),
    excludeWithWebsite: z.boolean().optional(),
  })
  .strict();
export const analysisSchema = z.object({
  businessSummary: z.string().max(1500),
  opportunities: z
    .array(
      z.object({
        title: z.string().max(200),
        description: z.string().max(1000),
        evidence: z.string().max(500),
        sourceUrl: z.string().max(2048),
        confidence: z.enum(["high", "medium", "low"]),
        suggestedService: z.string().max(300),
      }),
    )
    .max(8),
  recommendedService: z.string().max(300),
  suggestedApproach: z.string().max(1000),
  limitations: z.array(z.string().max(500)).max(15),
});
export const weightsSchema = z
  .object({
    need: z.number().min(0).max(100),
    technical: z.number().min(0).max(100),
    contact: z.number().min(0).max(100),
    fit: z.number().min(0).max(100),
    quality: z.number().min(0).max(100),
    signals: z.number().min(0).max(100),
  })
  .refine(
    (v) => Object.values(v).reduce((a, b) => a + b, 0) === 100,
    "A soma dos pesos deve ser 100",
  );
export const settingsInput = z
  .object({
    company: z.string().min(2).max(150),
    description: z.string().max(1500),
    services: z.string().min(2).max(1000),
    tone: z.enum(["Direto", "Consultivo", "Profissional"]),
    model: z.string().max(100),
    researchModel: z.string().max(100).optional(),
    searchProvider: z.enum(["gemini", "tavily"]).optional(),
    dailyLimit: z.number().int().min(1).max(100),
    city: z.string().min(2).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radiusKm: z.number().min(0.1).max(50),
    weights: weightsSchema,
    apiKey: z.string().max(300).optional(),
    clearApiKey: z.boolean().optional(),
    tavilyApiKey: z.string().max(512).optional(),
    clearTavilyApiKey: z.boolean().optional(),
  })
  .strict();
export type SearchInput = z.infer<typeof searchInput>;
export type LeadInput = z.infer<typeof leadInput>;
export type Analysis = z.infer<typeof analysisSchema>;
export type Weights = z.infer<typeof weightsSchema>;
export type Settings = z.infer<typeof settingsInput> & {
  aiConfigured?: boolean;
  searchConfigured?: boolean;
};
export type Lead = LeadInput & {
  id: string;
  workspaceId: string;
  stage: (typeof stages)[number];
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
  score: number | null;
  scoreDetail: Score | null;
};
export type Audit = {
  status:
    "not_informed" | "inaccessible" | "partial" | "completed" | "unavailable";
  url: string | null;
  checkedAt: string;
  httpStatus?: number;
  title?: string;
  description?: string;
  viewport?: boolean;
  headings?: number;
  contactLinks?: number;
  forms?: number;
  socialLinks?: string[];
  navigationLinks?: number;
  https?: boolean;
  limitations: string[];
  evidence: { key: string; value: string; sourceUrl: string; date: string }[];
};
export type Score = {
  value: number | null;
  status: "insufficient" | "rated";
  factors: { label: string; points: number; max: number; evidence: string }[];
  calculatedAt: string;
};
export const defaultWeights: Weights = {
  need: 25,
  technical: 25,
  contact: 15,
  fit: 15,
  quality: 10,
  signals: 10,
};

export const researchedCompanySchema = z.object({
  websiteStatus: z.enum(["has_website", "not_found", "inconclusive"]),
  website: leadInput.shape.website,
  phone: leadInput.shape.phone,
  email: leadInput.shape.email,
  address: leadInput.shape.address,
  city: leadInput.shape.city,
  state: leadInput.shape.state,
  mapsUrl: leadInput.shape.website,
});
export const contactResearchSchema = z.object({
  text: z.string().min(1).max(50000),
  sources: z
    .array(
      z.object({
        title: z.string().max(500),
        url: z.url().refine((v) => /^https?:\/\//i.test(v)),
        provider: z.enum(["Google Maps", "Google Search", "Tavily"]).optional(),
      }),
    )
    .min(1)
    .max(50),
  searchSuggestions: z.string().max(100000).optional(),
  company: researchedCompanySchema.optional(),
});
export type ContactResearch = z.infer<typeof contactResearchSchema>;

export const websiteScreeningSchema = z.object({
  kind: z.literal("website-screening"),
  deadline: z.number(),
  discoveryReport: contactResearchSchema.optional(),
  candidates: z.array(
    z.object({
      lead: leadInput,
      decision: z.enum(["pending", "has_website", "not_found", "inconclusive"]),
      reason: z.string(),
      sources: z.array(contactResearchSchema.shape.sources.element).max(51),
      searchSuggestions: z.string().optional(),
    }),
  ),
});
