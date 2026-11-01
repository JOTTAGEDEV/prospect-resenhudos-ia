import { and, eq } from "drizzle-orm";
import {
  websiteScreeningSchema as screeningSchema,
  type SearchInput,
  type LeadInput,
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
  search: BusinessSearchProvider,
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
    const candidates = await search.search(input, signal);
    signal.throwIfAborted();
    throw new JobContinuation(
      {
        kind: "website-screening",
        deadline,
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
      if (!site) {
        if (!ai.researchContacts)
          throw new Error("Pesquisa Gemini indisponível.");
        usedResearch = true;
        const report = await ai.researchContacts(
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
            "A pesquisa retornou uma resposta grande demais para exibir com segurança. Tente uma nova rodada.",
          );
        candidate.sources = report.sources;
        candidate.searchSuggestions = report.searchSuggestions;
        candidate.reason = report.text.slice(0, 8000);
        decision = report.text
          .split(/\r?\n/)[0]
          .trim()
          .replace(/(?:\s*\[\d+\])+$/, "");
        site = businessWebsite(
          /^SITE_CONFIRMADO:\s*(https?:\/\/\S+)$/i.exec(decision)?.[1],
        );
      }
      if (site) {
        const audit = await auditor.audit(site, stageSignal);
        signal.throwIfAborted();
        if (
          (audit.status === "completed" || audit.status === "partial") &&
          audit.httpStatus &&
          audit.httpStatus >= 200 &&
          audit.httpStatus < 300 &&
          businessWebsite(audit.url)
        ) {
          candidate.decision = "has_website";
          candidate.reason =
            `Site encontrado e acessível: ${site}. ` + candidate.reason;
          candidate.sources.push({ title: "Site verificado", url: site });
        } else {
          candidate.decision = "inconclusive";
          candidate.reason =
            `Há um possível site, mas não foi possível confirmar o acesso: ${site}. ` +
            candidate.reason;
        }
      } else if (decision === "SITE_NAO_LOCALIZADO") {
        candidate.decision = "not_found";
      } else {
        candidate.decision = "inconclusive";
        candidate.reason ||=
          "Não foi possível concluir se esta empresa tem site próprio.";
      }
    } catch (error) {
      signal.throwIfAborted();
      candidate.decision = "inconclusive";
      candidate.reason =
        error instanceof Error ? error.message : "Falha na verificação.";
      // An unavailable AI/quota must not trigger dozens of identical paid calls.
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        [400, 409, 429, 502].includes(Number(error.statusCode))
      ) {
        for (const item of checkpoint.candidates)
          if (
            item.decision === "pending" &&
            !businessWebsite(item.lead.website)
          ) {
            item.decision = "inconclusive";
            item.reason = `Verificação interrompida: ${candidate.reason}`;
          }
      }
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
