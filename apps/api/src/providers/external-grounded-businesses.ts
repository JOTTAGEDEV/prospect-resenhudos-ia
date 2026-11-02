import { z } from "zod";
import {
  contactResearchSchema,
  leadInput,
  researchedCompanySchema,
  type ContactResearch,
  type SearchInput,
} from "../../../../packages/shared/src/index.js";
import { AppError, normalizePhone } from "../services/leads.js";
import {
  distanceKm,
  includesContact,
  includesCoordinate,
  parseResearchJson,
  prettyCompany,
} from "./grounded-businesses.js";
import type { SearchDocument } from "./tavily.js";

const citation = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    sourceId: z.number().int().min(1),
    quote: z.string().min(3).max(2000),
  });
const optionalCitation = <T extends z.ZodType>(value: T) =>
  citation(value).nullable().optional();
export const externalBusinessSchema = z.object({
  name: citation(leadInput.shape.name),
  websiteStatus: z.enum(["has_website", "not_found", "inconclusive"]),
  website: optionalCitation(z.url().max(2048)),
  phone: optionalCitation(z.string().max(30)),
  email: optionalCitation(z.email().max(254)),
  address: optionalCitation(z.string().max(500)),
  city: optionalCitation(z.string().max(100)),
  state: optionalCitation(z.string().length(2)),
  latitude: optionalCitation(z.number().min(-90).max(90)),
  longitude: optionalCitation(z.number().min(-180).max(180)),
  mapsUrl: optionalCitation(z.url().max(2048)),
});
export const externalDiscoverySchema = z.object({
  businesses: z.array(externalBusinessSchema).max(50),
});

export function externalOutputGuide(discovery: boolean) {
  const example = {
    name: {
      value: "FORMAT_EXAMPLE_ONLY",
      sourceId: 1,
      quote: "FORMAT_EXAMPLE_ONLY",
    },
    websiteStatus: "inconclusive",
    website: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    state: null,
    latitude: null,
    longitude: null,
    mapsUrl: null,
  };
  return `websiteStatus is a plain string: has_website, not_found or inconclusive. Never wrap websiteStatus in a citation. Each other supported field must be a citation object with value, numeric sourceId (the actual id of a supplied document), and a brief exact source quote of at most 2000 characters. Missing optional fields must be null at the field level, never {"value":null,"sourceId":null,"quote":null}. State values must be two-letter Brazilian abbreviations only when supported. Addresses must be concise street addresses of at most 500 characters. Omit businesses without a supported name citation. ${discovery ? 'Return {"businesses":[]} when no businesses are supported.' : "For an unidentified business return an inconclusive result; do not invent its name or citations."} This fictional example illustrates structure only. NEVER copy its values into results or treat it as evidence: ${JSON.stringify(discovery ? { businesses: [example] } : example)}`;
}
type Business = z.infer<typeof externalBusinessSchema>;
type Reference = { value: string | number; sourceId: number; quote: string };
const normalized = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const contains = (text: string, value: string) =>
  !!normalized(value) && normalized(text).includes(normalized(value));
const whitespace = (text: string) => text.replace(/\s+/g, " ").trim();

function ownWebsite(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const platforms = [
      "instagram.com",
      "facebook.com",
      "fb.com",
      "wa.me",
      "whatsapp.com",
      "linktr.ee",
      "google.com",
      "google.com.br",
      "g.page",
      "maps.app.goo.gl",
      "booking.com",
      "tripadvisor.com",
      "tripadvisor.com.br",
      "youtube.com",
      "tiktok.com",
      "linkedin.com",
    ];
    return platforms.some(
      (domain) => host === domain || host.endsWith("." + domain),
    )
      ? null
      : url.href;
  } catch {
    return null;
  }
}
function mapsLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      ([
        "maps.google.com",
        "maps.google.com.br",
        "maps.app.goo.gl",
        "g.page",
      ].includes(url.hostname) ||
        ([
          "google.com",
          "www.google.com",
          "google.com.br",
          "www.google.com.br",
        ].includes(url.hostname) &&
          url.pathname.startsWith("/maps")))
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// A citation is useful only when its quote exists in an actual search document.
// Never manufacture Google grounding metadata for externally retrieved pages.
function checkedCompany(
  raw: Business,
  documents: SearchDocument[],
  targetedWebsiteSearch = false,
) {
  const references = new Set<number>();
  const verify = (
    reference: Reference | null | undefined,
    kind?: "url" | "email" | "phone",
  ) => {
    if (!reference) return null;
    const document = documents.find((item) => item.id === reference.sourceId);
    if (!document) return null;
    const quote = whitespace(reference.quote);
    const text = whitespace(
      `${document.title}\n${document.content}\n${document.url}`,
    );
    if (!text.includes(quote)) return null;
    // Directory pages can contain several companies. Require the cited snippet
    // itself to identify this company unless the page title already identifies it.
    if (
      !contains(document.title, raw.name.value) &&
      !contains(quote, raw.name.value)
    )
      return null;
    const value = reference.value;
    const supported =
      typeof value === "number"
        ? includesCoordinate(quote, value)
        : kind
          ? includesContact(quote, value, kind)
          : contains(quote, value);
    if (!supported) return null;
    references.add(document.id);
    return value;
  };
  const name = verify(raw.name);
  if (typeof name !== "string") return null;
  const textField = (
    reference: Reference | null | undefined,
    kind?: "url" | "email" | "phone",
  ) => {
    const result = verify(reference, kind);
    return typeof result === "string" ? result : null;
  };
  const website = ownWebsite(textField(raw.website, "url"));
  const address = textField(raw.address);
  const city = textField(raw.city);
  // A model may omit an official site explicitly present in retrieved evidence.
  // Never approve "not found" when an identified company's snippet contradicts it.
  // A search result's own URL alone does not establish an official company site.
  const websiteContradiction = documents.some((document) => {
    const text = whitespace(document.content);
    const mentions = text.matchAll(
      /\b(?:site(?:\s+oficial)?|website)\b[\s:;=()[\]_*—–-]{0,20}(https?:\/\/[^\s<>"'\\]+)/gi,
    );
    for (const mention of mentions) {
      const url = mention[1].replace(/[.,;!?)\]}]+$/, "");
      const context = text.slice(
        Math.max(0, mention.index - 400),
        mention.index,
      );
      if (
        ownWebsite(url) &&
        (contains(document.title, name) || contains(context, name))
      ) {
        references.add(document.id);
        return true;
      }
    }
    return false;
  });
  const company = researchedCompanySchema.parse({
    websiteStatus:
      website && raw.websiteStatus === "has_website"
        ? "has_website"
        : targetedWebsiteSearch &&
            raw.websiteStatus === "not_found" &&
            !raw.website &&
            !website &&
            !websiteContradiction &&
            address &&
            city
          ? "not_found"
          : "inconclusive",
    website,
    phone: textField(raw.phone, "phone"),
    email: textField(raw.email, "email"),
    address,
    city,
    state: textField(raw.state),
    mapsUrl: mapsLink(textField(raw.mapsUrl, "url")),
  });
  const latitude = verify(raw.latitude),
    longitude = verify(raw.longitude);
  return {
    name,
    company,
    latitude: typeof latitude === "number" ? latitude : null,
    longitude: typeof longitude === "number" ? longitude : null,
    references,
  };
}
const sourcesFor = (documents: SearchDocument[], ids?: Set<number>) =>
  documents
    .filter((document) => !ids || ids.has(document.id))
    .map(({ title, url }) => ({ title, url, provider: "Tavily" as const }));

export function externalDiscovery(
  text: string,
  documents: SearchDocument[],
  input: SearchInput,
) {
  if (!documents.length)
    throw new AppError(
      502,
      "A pesquisa Tavily não retornou fontes. Tente outro segmento ou região.",
    );
  const output = externalDiscoverySchema.parse(parseResearchJson(text));
  const seen = new Set<string>(),
    used = new Set<number>();
  const rejected = { identity: 0, locality: 0, distance: 0 };
  const leads = output.businesses
    .flatMap((raw) => {
      const checked = checkedCompany(raw, documents);
      if (!checked) {
        rejected.identity++;
        return [];
      }
      const { name, company, latitude, longitude } = checked;
      const located = latitude !== null && longitude !== null;
      if (
        located &&
        distanceKm(input.latitude, input.longitude, latitude, longitude) >
          input.radiusKm
      ) {
        rejected.distance++;
        return [];
      }
      if (
        !located &&
        (!company.address ||
          !company.city ||
          normalized(company.city) !== normalized(input.city))
      ) {
        rejected.locality++;
        return [];
      }
      const identity = normalized(
        name + "|" + (company.address || company.city),
      );
      if (seen.has(identity)) return [];
      seen.add(identity);
      checked.references.forEach((id) => used.add(id));
      return [
        leadInput.parse({
          name,
          category: input.category,
          city: company.city,
          state: company.state,
          address: company.address,
          website: company.website,
          phone: normalizePhone(company.phone),
          email: company.email,
          latitude,
          longitude,
          source: "Tavily + Gemini",
          sourceUrl: documents.find((document) =>
            checked.references.has(document.id),
          )?.url,
          notes: `${company.mapsUrl ? "Google Maps: " + company.mapsUrl + "\n" : ""}${located ? "Coordenadas verificadas nos resultados da busca." : "Coordenadas não confirmadas; endereço na cidade solicitada. Distância exata precisa de revisão."}\nContatos extraídos de fontes públicas; confira antes de abordar.`,
        }),
      ];
    })
    .slice(0, input.limit);
  if (output.businesses.length && !leads.length)
    throw new AppError(
      502,
      `A busca não trouxe empresas com identidade e localização comprovadas na região. Avaliadas: ${output.businesses.length}; sem identidade ou trecho verificável: ${rejected.identity}; sem endereço/cidade verificáveis: ${rejected.locality}; fora do raio: ${rejected.distance}. Tente outro segmento ou região.`,
    );
  return {
    leads,
    report: contactResearchSchema.parse({
      text: `Pesquisa na web com Tavily, organizada pelo Gemini: ${leads.length} empresas com evidências de identidade e localização.\n\n${leads.map((lead) => prettyCompany(lead.name, { websiteStatus: "inconclusive", website: lead.website, phone: lead.phone, email: lead.email, address: lead.address, city: lead.city, state: lead.state })).join("\n\n")}\n\nA cobertura não é exaustiva. A busca pode retornar links públicos do Maps; não consulta diretamente a API Google Maps. Distâncias sem coordenadas e contatos precisam de revisão.`,
      sources: sourcesFor(documents, used.size ? used : undefined),
    }),
  };
}

export function externalContactReport(
  text: string,
  documents: SearchDocument[],
  expected: { name: string; city?: string | null; address?: string | null },
): ContactResearch {
  if (!documents.length)
    throw new AppError(
      502,
      "Tavily não retornou fontes para verificar esta empresa. Nenhum contato foi alterado.",
    );
  const raw = externalBusinessSchema.parse(parseResearchJson(text));
  const checked = checkedCompany(raw, documents, true);
  const sameName = normalized(raw.name.value) === normalized(expected.name);
  const sameCity =
    !expected.city ||
    normalized(checked?.company.city || "") === normalized(expected.city);
  const sameAddress =
    !expected.address ||
    !checked?.company.address ||
    contains(checked.company.address, expected.address) ||
    contains(expected.address, checked.company.address);
  const company =
    checked && sameName && sameCity && sameAddress
      ? checked.company
      : researchedCompanySchema.parse({ websiteStatus: "inconclusive" });
  const marker =
    company.websiteStatus === "has_website"
      ? `SITE_CONFIRMADO: ${company.website}`
      : company.websiteStatus === "not_found"
        ? "SITE_NAO_LOCALIZADO"
        : "INCONCLUSIVO";
  return contactResearchSchema.parse({
    text: `${marker}\n${prettyCompany(expected.name, company)}\nDados verificados nos trechos retornados pelo Tavily. Ausência de site nesta pesquisa não comprova inexistência. Confira a identidade e as fontes antes de usar os contatos.`,
    company,
    sources: sourcesFor(
      documents,
      checked?.references.size ? checked.references : undefined,
    ),
  });
}
