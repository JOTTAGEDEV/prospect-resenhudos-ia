import { and, eq, desc } from "drizzle-orm";
import {
  leadInput,
  defaultWeights,
  type LeadInput,
  type Audit,
  type Score,
  type Weights,
} from "@jotage/shared";
import { type DB, stamp } from "../database/db.js";
import * as s from "../database/schema.js";
import { digest } from "../security/crypto.js";
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const normalizeName = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function normalizePhone(value: string | null | undefined) {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/.test(digits)
    ? digits
    : null;
}
export const domain = (url: string | null | undefined) => {
  try {
    return url
      ? new URL(url).hostname.toLowerCase().replace(/^www\./, "")
      : null;
  } catch {
    return null;
  }
};
export function contacts(lead: {
  phone?: string | null;
  email?: string | null;
  identity: string;
}) {
  return [
    lead.identity,
    lead.phone && `phone:${normalizePhone(lead.phone) || lead.phone}`,
    lead.email && `email:${lead.email.toLowerCase()}`,
  ].filter((v): v is string => !!v);
}
export async function getLead(db: DB, workspaceId: string, id: string) {
  const lead = await db
    .select()
    .from(s.leads)
    .where(and(eq(s.leads.workspaceId, workspaceId), eq(s.leads.id, id)))
    .get();
  if (!lead) throw new AppError(404, "Empresa não encontrada");
  return lead;
}
export async function assertContactAllowed(
  db: DB,
  workspaceId: string,
  lead: s.DbLead,
) {
  if (
    lead.stage === "Não contatar" ||
    (
      await Promise.all(
        contacts(lead).map(
          async (contact) =>
            await db
              .select()
              .from(s.suppression)
              .where(
                and(
                  eq(s.suppression.workspaceId, workspaceId),
                  eq(s.suppression.contact, contact),
                ),
              )
              .get(),
        ),
      )
    ).some(Boolean)
  )
    throw new AppError(409, "Contato bloqueado pela lista de supressão");
}
export async function saveLead(
  db: DB,
  workspaceId: string,
  input: LeadInput,
  isDemo = false,
) {
  const data = leadInput.parse(input);
  const phone = normalizePhone(data.phone),
    name = normalizeName(data.name);
  const identity = data.sourceId
    ? `${data.source}:${data.sourceId}`
    : digest(
        `${name}|${normalizeName(data.address || "")}|${normalizeName(data.city || "")}|${phone || ""}|${domain(data.website) || ""}`,
      );
  let existing = await db
    .select()
    .from(s.leads)
    .where(
      and(eq(s.leads.workspaceId, workspaceId), eq(s.leads.identity, identity)),
    )
    .get();
  // Domain alone cannot establish identity: chains and franchises share websites.
  if (!existing && (phone || data.address))
    existing = (
      await db
        .select()
        .from(s.leads)
        .where(eq(s.leads.workspaceId, workspaceId))
        .all()
    ).find(
      (l) =>
        normalizeName(l.name) === name &&
        normalizeName(l.city || "") === normalizeName(data.city || "") &&
        ((phone && phone === l.phone) ||
          (data.address &&
            normalizeName(data.address) === normalizeName(l.address || "") &&
            domain(data.website) === domain(l.website))),
    );
  if (existing) {
    const known = await db
      .select()
      .from(s.sources)
      .where(
        and(
          eq(s.sources.workspaceId, workspaceId),
          eq(s.sources.leadId, existing.id),
          eq(s.sources.source, data.source),
        ),
      )
      .all();
    if (
      !known.some(
        (source) =>
          source.sourceId === (data.sourceId ?? null) &&
          source.url === (data.sourceUrl ?? null),
      )
    ) {
      await db
        .insert(s.sources)
        .values({
          ...stamp(),
          workspaceId,
          leadId: existing.id,
          source: data.source,
          sourceId: data.sourceId,
          url: data.sourceUrl,
        })
        .run();
    }
    return { lead: existing, duplicate: true };
  }
  const lead = {
    ...stamp(),
    ...data,
    workspaceId,
    phone,
    isDemo,
    identity,
    stage: "Novo lead",
  };
  const saved = await db.transaction(async (tx) => {
    const row = await tx.insert(s.leads).values(lead).returning().get();
    await tx
      .insert(s.sources)
      .values({
        ...stamp(),
        workspaceId,
        leadId: row.id,
        source: data.source,
        sourceId: data.sourceId,
        url: data.sourceUrl,
      })
      .run();
    return row;
  });
  return { lead: saved, duplicate: false };
}
export function calculateScore(
  lead: LeadInput,
  audit: Audit | undefined,
  weights: Weights = defaultWeights,
): Score {
  const factors: Score["factors"] = [];
  const add = (
    label: string,
    key: keyof Weights,
    fraction: number,
    evidence: string,
  ) =>
    factors.push({
      label,
      max: weights[key],
      points: Math.round(weights[key] * fraction),
      evidence,
    });
  const complete = audit?.status === "completed";
  add(
    "Necessidade verificada de site",
    "need",
    audit?.status === "inaccessible" ? 0.4 : 0,
    audit?.status === "inaccessible"
      ? "Site inacessível na verificação limitada; não comprova ausência."
      : "Sem evidência de necessidade de um novo site.",
  );
  const missing = complete
    ? [
        !audit.title,
        !audit.description,
        !audit.viewport,
        audit.headings === 0,
      ].filter(Boolean).length
    : 0;
  add(
    "Problemas técnicos",
    "technical",
    missing / 4,
    complete
      ? `${missing} de 4 verificações HTML sem elemento encontrado.`
      : "Verificações ainda não realizadas.",
  );
  add(
    "Contato comercial",
    "contact",
    lead.phone || lead.email ? 1 : 0,
    lead.phone || lead.email
      ? "Canal informado na fonte; verificar antes de abordar."
      : "Contato desconhecido.",
  );
  add(
    "Adequação aos serviços",
    "fit",
    complete && missing > 0 ? 1 : 0,
    complete && missing > 0
      ? "Correções HTML/SEO relacionadas a desenvolvimento web."
      : "Adequação ainda não comprovada.",
  );
  const known = [
    lead.name,
    lead.category,
    lead.city,
    lead.address,
    lead.website,
  ].filter(Boolean).length;
  add(
    "Completude dos dados",
    "quality",
    known / 5,
    `${known} de 5 campos disponíveis; campos desconhecidos não são problemas comerciais.`,
  );
  add(
    "Sinais comerciais",
    "signals",
    complete && audit.contactLinks === 0 ? 0.5 : 0,
    complete && audit.contactLinks === 0
      ? "Nenhum link tel/mailto/WhatsApp identificado na página."
      : "Sem sinal adicional verificado.",
  );
  const insufficient =
    !audit || audit.status === "not_informed" || audit.status === "unavailable";
  return {
    value: insufficient
      ? null
      : Math.min(
          100,
          factors.reduce((n, f) => n + f.points, 0),
        ),
    status: insufficient ? "insufficient" : "rated",
    factors,
    calculatedAt: new Date().toISOString(),
  };
}
export async function scoreLead(
  db: DB,
  workspaceId: string,
  id: string,
  weights: Weights,
) {
  const lead = await getLead(db, workspaceId, id);
  const audit = await db
    .select()
    .from(s.audits)
    .where(and(eq(s.audits.workspaceId, workspaceId), eq(s.audits.leadId, id)))
    .orderBy(desc(s.audits.createdAt))
    .get();
  const result = calculateScore(lead, audit?.data, weights);
  await db.transaction(async (tx) => {
    await tx
      .insert(s.scores)
      .values({ ...stamp(), workspaceId, leadId: id, data: result })
      .run();
    await tx
      .update(s.leads)
      .set({
        score: result.value,
        scoreDetail: result,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(s.leads.workspaceId, workspaceId), eq(s.leads.id, id)))
      .run();
  });
  return result;
}
export function whatsappLink(phone: string | null, text: string) {
  const normalized = normalizePhone(phone);
  if (!normalized)
    throw new AppError(400, "Informe um telefone comercial brasileiro válido");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}
