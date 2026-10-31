import { z } from "zod";
import type { SearchInput, LeadInput } from "@jotage/shared";
import { config } from "../config.js";
import { AppError, normalizePhone } from "../services/leads.js";
export interface BusinessSearchProvider {
  search(input: SearchInput, signal?: AbortSignal): Promise<LeadInput[]>;
}
const tags: Record<SearchInput["category"], string> = {
  "Oficinas mecânicas": '["shop"="car_repair"]',
  Restaurantes: '["amenity"="restaurant"]',
  Imobiliárias: '["office"="estate_agent"]',
  Hotéis: '["tourism"="hotel"]',
  Clínicas: '["amenity"="clinic"]',
  Academias: '["leisure"="fitness_centre"]',
  Barbearias: '["shop"="hairdresser"]["male"="yes"]',
  Salões: '["shop"="hairdresser"]',
  Lojas: '["shop"="convenience"]',
  Serviços: '["office"]',
};
const element = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
export const overpassResponse = z.object({
  elements: z.array(element).max(10000),
  remark: z.string().optional(),
});
export function normalizeResults(
  raw: unknown,
  input: SearchInput,
): LeadInput[] {
  const parsed = overpassResponse.parse(raw);
  if (parsed.remark)
    throw new AppError(
      502,
      "A fonte retornou uma resposta parcial. Repita mais tarde com raio menor.",
    );
  return parsed.elements
    .filter((e) => e.tags?.name)
    .slice(0, input.limit)
    .map((e) => {
      const t = e.tags!,
        website = t["contact:website"] || t.website;
      let safeWebsite: string | null = null;
      try {
        if (website) {
          const u = new URL(
            /^https?:\/\//i.test(website) ? website : `https://${website}`,
          );
          if (["http:", "https:"].includes(u.protocol)) safeWebsite = u.href;
        }
      } catch {
        /* Unknown remains null. */
      }
      const email = t["contact:email"] || t.email;
      return {
        name: t.name.slice(0, 180),
        category: input.category,
        address:
          [t["addr:street"], t["addr:housenumber"], t["addr:suburb"]]
            .filter(Boolean)
            .join(", ") || null,
        city: t["addr:city"] || null,
        state: t["addr:state"] || null,
        latitude: e.lat ?? e.center?.lat ?? null,
        longitude: e.lon ?? e.center?.lon ?? null,
        website: safeWebsite,
        phone: normalizePhone(t["contact:phone"] || t.phone),
        email: email && z.email().safeParse(email).success ? email : null,
        source: "OpenStreetMap",
        sourceId: `${e.type}/${e.id}`,
        sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        notes: "",
        tags: [],
      };
    });
}
export class OverpassProvider implements BusinessSearchProvider {
  constructor(private request: typeof fetch = fetch) {}
  async search(input: SearchInput, signal?: AbortSignal) {
    const query = `[out:json][timeout:20][maxsize:16777216];nwr${tags[input.category]}(around:${Math.round(input.radiusKm * 1000)},${input.latitude},${input.longitude});out center ${input.limit};`;
    const response = await this.request(config.overpass, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      headers: { "User-Agent": "JotageProspectAI/0.1 (manual local research)" },
      signal: AbortSignal.any([
        AbortSignal.timeout(30000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (response.status === 429 || response.status === 504)
      throw new AppError(
        429,
        "Overpass ocupado ou com limite atingido. Aguarde antes de repetir.",
      );
    if (!response.ok)
      throw new AppError(502, `Fonte indisponível (HTTP ${response.status})`);
    const reader = response.body?.getReader();
    if (!reader) throw new AppError(502, "Resposta vazia");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4_000_000) {
        await reader.cancel();
        throw new AppError(502, "Resposta excedeu o limite");
      }
      chunks.push(value);
    }
    return normalizeResults(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
      input,
    );
  }
}
