import { z } from "zod";
import type { GenerateContentResponse } from "@google/genai";
import {
  contactResearchSchema,
  leadInput,
  researchedCompanySchema,
  type ContactResearch,
  type SearchInput,
} from "../../../../packages/shared/src/index.js";
import { AppError, normalizePhone } from "../services/leads.js";

export const discoveredBusinessSchema = z.object({
  name: leadInput.shape.name,
  websiteStatus: z
    .enum(["has_website", "not_found", "inconclusive"])
    .default("inconclusive"),
  website: leadInput.shape.website,
  phone: leadInput.shape.phone,
  email: leadInput.shape.email,
  address: leadInput.shape.address,
  city: leadInput.shape.city,
  state: leadInput.shape.state,
  latitude: leadInput.shape.latitude,
  longitude: leadInput.shape.longitude,
  mapsUrl: leadInput.shape.website,
});
export const discoveryOutputSchema = z.object({
  businesses: z.array(discoveredBusinessSchema).max(50),
});
export type DiscoveredBusiness = z.infer<typeof discoveredBusinessSchema>;

const normalized = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const includesValue = (text: string, value: string) =>
  !!normalized(value) && normalized(text).includes(normalized(value));

export function includesContact(
  text: string,
  value: string,
  kind: "url" | "email" | "phone",
) {
  const decoded = text.replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
  if (kind === "email") {
    const addresses =
      decoded.match(
        /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/gi,
      ) || [];
    return addresses.some(
      (address) => address.toLowerCase() === value.toLowerCase(),
    );
  }
  if (kind === "phone") {
    const target = normalizePhone(value);
    return (
      !!target &&
      (decoded.match(/\+?\d[\d\s().-]{8,}\d/g) || []).some(
        (phone) => normalizePhone(phone) === target,
      )
    );
  }
  try {
    const target = new URL(value).href;
    return (decoded.match(/https?:\/\/[^\s<>"'\\]+/gi) || []).some((raw) => {
      try {
        return new URL(raw.replace(/[.,;!?)\]}]+$/, "")).href === target;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export const includesCoordinate = (text: string, value: number) =>
  (text.match(/[+-]?\d+(?:\.\d+)?/g) || []).some(
    (number) => Number(number) === value,
  );

export function parseResearchJson(text: string) {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}

export function groundingSources(response: GenerateContentResponse) {
  const chunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks
    .flatMap((chunk, index) => {
      const value = chunk.maps || chunk.web;
      if (!value?.uri || !/^https?:\/\//i.test(value.uri)) return [];
      try {
        const url = new URL(value.uri);
        if (url.username || url.password) return [];
        return [
          {
            index,
            title: (value.title || url.hostname).slice(0, 500),
            url: value.uri,
            provider: chunk.maps
              ? ("Google Maps" as const)
              : ("Google Search" as const),
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, 50);
}

function groundedEvidence(response: GenerateContentResponse) {
  const sources = groundingSources(response);
  const raw = response.text || "";
  const supports =
    response.candidates?.[0]?.groundingMetadata?.groundingSupports || [];
  const evidence = supports.flatMap((support) => {
    const references = sources.filter((source) =>
      support.groundingChunkIndices?.includes(source.index),
    );
    const text =
      support.segment?.text ||
      raw.slice(
        support.segment?.startIndex || 0,
        support.segment?.endIndex || 0,
      );
    return references.length && text ? [{ text, references }] : [];
  });
  if (!evidence.length)
    throw new AppError(
      502,
      "Gemini não retornou fontes verificáveis para esta pesquisa. Nenhum contato foi alterado.",
    );
  return { sources, evidence };
}

function verifiedCompany(
  company: DiscoveredBusiness,
  response: GenerateContentResponse,
) {
  const { sources, evidence } = groundedEvidence(response);
  const identity = evidence.filter(
    (item) =>
      includesValue(item.text, company.name) ||
      item.references.some((source) =>
        includesValue(source.title, company.name),
      ),
  );
  if (!identity.length) return null;
  const allowedSources = new Set(
    identity.flatMap((item) => item.references.map((source) => source.index)),
  );
  const text = evidence
    .filter((item) =>
      item.references.some((source) => allowedSources.has(source.index)),
    )
    .map((item) => item.text)
    .join("\n");
  const verified = (
    value: string | null | undefined,
    kind?: "url" | "email" | "phone",
  ) =>
    value &&
    (kind ? includesContact(text, value, kind) : includesValue(text, value))
      ? value
      : null;
  const maps = sources.find(
    (source) =>
      source.provider === "Google Maps" && allowedSources.has(source.index),
  );
  const website = verified(company.website, "url");
  const result = researchedCompanySchema.parse({
    websiteStatus:
      company.websiteStatus === "has_website"
        ? website
          ? "has_website"
          : "inconclusive"
        : company.websiteStatus === "not_found" &&
            includesValue(text, "not_found")
          ? "not_found"
          : "inconclusive",
    website,
    phone: verified(company.phone, "phone"),
    email: verified(company.email, "email"),
    address: verified(company.address),
    city: verified(company.city),
    state: verified(company.state),
    mapsUrl: maps?.url || null,
  });
  return {
    company: result,
    references: sources.filter((source) => allowedSources.has(source.index)),
    latitude:
      company.latitude != null && includesCoordinate(text, company.latitude)
        ? company.latitude
        : null,
    longitude:
      company.longitude != null && includesCoordinate(text, company.longitude)
        ? company.longitude
        : null,
  };
}

export function prettyCompany(name: string, company: ContactResearch["company"]) {
  if (!company) return name;
  return `${name}\nLocalidade: ${[company.address, company.city, company.state].filter(Boolean).join(", ") || "Não confirmada"}\nSite: ${company.website || "Não localizado"}\nTelefone: ${company.phone || "Não localizado"}\nEmail: ${company.email || "Não localizado"}\nGoogle Maps: ${company.mapsUrl || "Não localizado"}`;
}

export function structuredContactReport(
  response: GenerateContentResponse,
  expected: { name: string; city?: string | null },
) {
  groundedEvidence(response);
  const raw = discoveredBusinessSchema.parse(
    parseResearchJson(response.text || ""),
  );
  const checked = verifiedCompany(raw, response);
  const sameName =
    includesValue(raw.name, expected.name) ||
    includesValue(expected.name, raw.name);
  const sameCity =
    !expected.city ||
    (!!checked?.company.city &&
      normalized(checked.company.city) === normalized(expected.city));
  const company =
    checked && sameName && sameCity
      ? checked.company
      : researchedCompanySchema.parse({ websiteStatus: "inconclusive" });
  const sources = groundingSources(response).map(
    ({ title, url, provider }) => ({ title, url, provider }),
  );
  const marker =
    company.websiteStatus === "has_website"
      ? `SITE_CONFIRMADO: ${company.website}`
      : company.websiteStatus === "not_found"
        ? "SITE_NAO_LOCALIZADO"
        : "INCONCLUSIVO";
  return contactResearchSchema.parse({
    text: `${marker}\n${prettyCompany(expected.name, company)}\nAusência de site na pesquisa não comprova inexistência. Confira a identidade e as fontes antes de usar os contatos.`,
    company,
    sources,
    searchSuggestions:
      response.candidates?.[0]?.groundingMetadata?.searchEntryPoint
        ?.renderedContent,
  });
}

export function distanceKm(a: number, b: number, c: number, d: number) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((c - a) * rad) / 2) ** 2 +
    Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(((d - b) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function groundedDiscovery(
  response: GenerateContentResponse,
  input: SearchInput,
) {
  const output = discoveryOutputSchema.parse(
    parseResearchJson(response.text || ""),
  );
  const { sources } = groundedEvidence(response);
  const seen = new Set<string>();
  const leads = output.businesses
    .flatMap((item) => {
      const checked = verifiedCompany(item, response);
      if (!checked) return [];
      const { company, latitude, longitude, references } = checked;
      const located = latitude !== null && longitude !== null;
      if (
        located &&
        distanceKm(input.latitude, input.longitude, latitude, longitude) >
          input.radiusKm
      )
        return [];
      // No invented coordinates: keep only identified addresses in the requested city
      // when Google did not return coordinates, and explicitly disclose that limit.
      if (
        !located &&
        (!company.address ||
          !company.city ||
          normalized(company.city) !== normalized(input.city))
      )
        return [];
      const identity = normalized(
        item.name + "|" + (company.address || company.city),
      );
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [
        leadInput.parse({
          name: item.name,
          category: input.category,
          city: company.city,
          state: company.state,
          address: company.address,
          website: company.website,
          phone: normalizePhone(company.phone),
          email: company.email,
          latitude,
          longitude,
          source: "Gemini + Google",
          sourceUrl: references[0]?.url,
          notes: `${company.mapsUrl ? "Google Maps: " + company.mapsUrl + "\n" : ""}${located ? "Localização com coordenadas retornadas pela pesquisa." : "Coordenadas não confirmadas; endereço na cidade solicitada. Distância exata precisa de revisão."}\nContatos extraídos de pesquisa com fontes; confira antes de abordar.`,
        }),
      ];
    })
    .slice(0, input.limit);
  if (output.businesses.length && !leads.length)
    throw new AppError(
      502,
      "A pesquisa não trouxe empresas com identidade e localização comprovadas na região. Tente outro segmento ou região.",
    );
  const report = contactResearchSchema.parse({
    text: `Pesquisa com Google Search e Google Maps: ${leads.length} empresas com evidências de identidade e localização.\n\n${leads.map((lead) => prettyCompany(lead.name, { websiteStatus: "inconclusive", website: lead.website, phone: lead.phone, email: lead.email, address: lead.address, city: lead.city, state: lead.state })).join("\n\n")}\n\nA cobertura não é exaustiva. Distâncias sem coordenadas e contatos precisam de revisão.`,
    sources: sources.map(({ title, url, provider }) => ({
      title,
      url,
      provider,
    })),
    searchSuggestions:
      response.candidates?.[0]?.groundingMetadata?.searchEntryPoint
        ?.renderedContent,
  });
  return { leads, report };
}
