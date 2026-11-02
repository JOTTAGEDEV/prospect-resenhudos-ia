import { and, eq } from "drizzle-orm";
import {
  websiteScreeningSchema as screeningSchema,
  type SearchInput,
  type LeadInput,
  type ContactResearch,
} from "../../../../packages/shared/src/index.js";
import { type DB, stamp } from "../database/db.js";
import * as s from "../database/schema.js";
import type { Job } from "../workers/queue.js";
import { JobContinuation } from "../workers/continuation.js";
import type { BusinessSearchProvider } from "../providers/overpass.js";
import type { AIProvider } from "../providers/gemini.js";
import type { WebsiteAuditService } from "./audit.js";
import { AppError, saveLead } from "./leads.js";
import { GEMINI_TIMEOUT_MS } from "../config.js";
import { discoverBusinesses } from "./discovery-source.js";

export function businessWebsite(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const directories = [
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
    if (
      directories.some(
        (domain) => host === domain || host.endsWith("." + domain),
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function screenSearch(
  db: DB,
  job: Job,
  input: SearchInput,
  search: BusinessSearchProvider | undefined,
  ai: AIProvider,
  auditor: WebsiteAuditService,
  signal: AbortSignal,
) {
  const prior = screeningSchema.safeParse(job.result);
  if (!prior.success) {
    if (job.result !== null)
      throw new Error(
        "Progresso da verificação inválido. Inicie uma nova pesquisa.",
      );
    const deadline = Date.now() + 600000;
    const discovery = await discoverBusinesses(
      job.workspaceId,
      input,
      ai,
      signal,
      search,
    );
    const candidates = discovery.leads;
    signal.throwIfAborted();
    throw new JobContinuation(
      {
        kind: "website-screening",
        deadline,
        discoveryReport: discovery.report,
        candidates: candidates.map((lead) => ({
          lead,
          decision: "pending",
          reason: "",
          sources: [],
        })),
      },
      10,
    );
  }
  const checkpoint = prior.data;
  const candidate = checkpoint.candidates.find(
    (item) => item.decision === "pending",
  );
  if (candidate && Date.now() < checkpoint.deadline) {
    const remaining = checkpoint.deadline - Date.now();
    const stageSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(Math.max(1, Math.min(GEMINI_TIMEOUT_MS, remaining))),
    ]);
    let usedResearch = false;
    try {
      const known = businessWebsite(candidate.lead.website);
      let site = known;
      let decision = "";
      let report: ContactResearch | undefined;
      let verifiedDirectly = false;
      if (known) {
        const audit = await auditor.audit(known, stageSignal);
        verifiedDirectly = !!(
          audit.httpStatus &&
          audit.httpStatus >= 200 &&
          audit.httpStatus < 300 &&
          businessWebsite(audit.url)
        );
      }
      // A blocked or outdated URL is researched again instead of ending the check.
      if (!verifiedDirectly) {
        if (!ai.researchContacts)
          throw new AppError(409, "Pesquisa Gemini indisponível.");
        usedResearch = true;
        report = await ai.researchContacts(
          job.workspaceId,
          {
            name: candidate.lead.name,
            category: candidate.lead.category,
            city: candidate.lead.city || input.city,
            state: candidate.lead.state || input.state,
            address: candidate.lead.address,
            website: candidate.lead.website,
            audit: null,
            purpose: "website_verification",
          },
          stageSignal,
        );
        if ((report.searchSuggestions?.length || 0) > 20000)
          throw new AppError(
            502,
            "A pesquisa retornou uma resposta grande demais para exibir. Tente uma nova rodada.",
          );
        candidate.sources = report.sources;
        candidate.searchSuggestions = report.searchSuggestions;
        candidate.reason = report.text.slice(0, 8000);
        const company = report.company;
        if (company) {
          for (const field of [
            "phone",
            "email",
            "address",
            "city",
            "state",
          ] as const)
            if (company[field]) candidate.lead[field] = company[field];
          if (company.mapsUrl)
            candidate.lead.notes = (
              `Google Maps: ${company.mapsUrl}\n` + candidate.lead.notes
            ).slice(0, 5000);
          site = businessWebsite(company.website);
          decision =
            company.websiteStatus === "not_found" ? "SITE_NAO_LOCALIZADO" : "";
        } else {
          // Compatibility with reports created before structured enrichment.
          decision = report.text
            .split(/\r?\n/)[0]
            .trim()
            .replace(/(?:\s*\[\d+\])+$/, "");
          site = businessWebsite(
            /^SITE_CONFIRMADO:\s*(https?:\/\/\S+)$/i.exec(decision)?.[1],
          );
        }
      }
      signal.throwIfAborted();
      if (verifiedDirectly && known) {
        candidate.decision = "has_website";
        candidate.reason = `Site encontrado e acessível: ${known}.`;
        candidate.sources = [{ title: "Site verificado", url: known }];
      } else if (site) {
        const audit = await auditor.audit(site, stageSignal);
        signal.throwIfAborted();
        const reachable = !!(
          audit.httpStatus &&
          audit.httpStatus >= 200 &&
          audit.httpStatus < 300 &&
          businessWebsite(audit.url)
        );
        const grounded =
          report?.company?.websiteStatus === "has_website" &&
          report.sources.length > 0;
        if (reachable || grounded) {
          candidate.decision = "has_website";
          candidate.lead.website = site;
          candidate.reason =
            (reachable
              ? `Site encontrado e acessível: ${site}. `
              : `Site confirmado nas fontes da pesquisa; acesso direto indisponível: ${site}. `) +
            candidate.reason;
          if (reachable)
            candidate.sources = [
              ...candidate.sources.slice(0, 50),
              { title: "Site verificado", url: site },
            ];
        } else {
          candidate.decision = "inconclusive";
          candidate.reason =
            `Não foi possível confirmar o site: ${site}. ` + candidate.reason;
        }
      } else if (decision === "SITE_NAO_LOCALIZADO" && !known) {
        candidate.decision = "not_found";
      } else {
        candidate.decision = "inconclusive";
        candidate.reason ||=
          "Não foi possível concluir se esta empresa tem site próprio.";
      }
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof AppError &&
        [400, 409, 429].includes(error.statusCode)
      )
        throw error;
      const transient =
        error instanceof AppError &&
        error.statusCode === 502 &&
        /temporariamente|comunicar|conex|prazo|HTTP 50[0234]/i.test(
          error.message,
        );
      if (transient && job.attempts < 3 && Date.now() < checkpoint.deadline)
        throw error;
      candidate.decision = "inconclusive";
      candidate.reason =
        error instanceof Error ? error.message : "Falha na verificação.";
    }
    const done = checkpoint.candidates.filter(
      (item) => item.decision !== "pending",
    ).length;
    throw new JobContinuation(
      checkpoint,
      10 + Math.floor((80 * done) / Math.max(1, checkpoint.candidates.length)),
      usedResearch && done < checkpoint.candidates.length ? 15000 : 0,
    );
  }
  for (const item of checkpoint.candidates)
    if (item.decision === "pending") {
      item.decision = "inconclusive";
      item.reason =
        "Janela de 10 minutos encerrada antes desta verificação. Nenhum dado foi inventado.";
    }
  signal.throwIfAborted();
  let duplicates = 0;
  let total = 0;
  const selected = checkpoint.candidates.filter(
    (item) => item.decision === "not_found",
  );
  await db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(s.jobs)
      .where(eq(s.jobs.id, job.id))
      .get();
    if (current?.status !== "running")
      throw new Error("Verificação interrompida.");
    for (const item of selected) {
      signal.throwIfAborted();
      const input: LeadInput = { ...item.lead };
      if (input.website && !businessWebsite(input.website)) {
        input.notes = (
          `Perfil ou diretório encontrado: ${input.website}\n` + input.notes
        ).slice(0, 5000);
        input.website = null;
      }
      const saved = await saveLead(tx, job.workspaceId, input);
      if (businessWebsite(saved.lead.website)) {
        item.decision = "inconclusive";
        item.reason =
          "A empresa já tem um site registrado no CRM; confira antes de reutilizar este lead. " +
          item.reason;
        continue;
      }
      if (saved.duplicate) duplicates++;
      total++;
      await tx
        .insert(s.results)
        .values({
          ...stamp(),
          workspaceId: job.workspaceId,
          searchId: job.targetId,
          leadId: saved.lead.id,
        })
        .onConflictDoNothing()
        .run();
    }
    await tx
      .update(s.searches)
      .set({
        status: "completed",
        total,
        duplicates,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(s.searches.id, job.targetId),
          eq(s.searches.workspaceId, job.workspaceId),
        ),
      )
      .run();
  });
  return checkpoint;
}
