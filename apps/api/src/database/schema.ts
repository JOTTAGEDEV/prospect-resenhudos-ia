import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  foreignKey,
} from "drizzle-orm/sqlite-core";
import type {
  LeadInput,
  Audit,
  Analysis,
  Score,
  Settings,
} from "../../../../packages/shared/src/index.js";

const common = () => ({
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const workspaces = sqliteTable("workspaces", {
  ...common(),
  name: text("name").notNull(),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
});
const workspace = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
export const users = sqliteTable("users", {
  ...common(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
});
export const members = sqliteTable(
  "workspace_members",
  {
    ...common(),
    workspaceId: workspace(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("admin"),
  },
  (t) => [uniqueIndex("member_unique").on(t.workspaceId, t.userId)],
);
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: workspace(),
  expiresAt: integer("expires_at").notNull(),
});
export const leads = sqliteTable(
  "business_leads",
  {
    ...common(),
    workspaceId: workspace(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    city: text("city"),
    state: text("state"),
    address: text("address"),
    website: text("website"),
    phone: text("phone"),
    email: text("email"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    notes: text("notes").notNull().default(""),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    sourceUrl: text("source_url"),
    stage: text("stage").notNull().default("Novo lead"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    score: integer("score"),
    scoreDetail: text("score_detail", { mode: "json" }).$type<Score>(),
    identity: text("identity").notNull(),
  },
  (t) => [
    uniqueIndex("lead_identity").on(t.workspaceId, t.identity),
    uniqueIndex("lead_workspace_id").on(t.workspaceId, t.id),
    index("lead_filter").on(t.workspaceId, t.stage, t.createdAt),
  ],
);
const leadRef = () => text("lead_id").notNull();
const link = (t: {
  workspaceId: ReturnType<typeof workspace>;
  leadId: ReturnType<typeof leadRef>;
}) => t;
void link;
export const sources = sqliteTable(
  "lead_sources",
  {
    ...common(),
    workspaceId: workspace(),
    leadId: leadRef(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    url: text("url"),
    purpose: text("purpose")
      .notNull()
      .default("Prospecção B2B com revisão humana"),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
  ],
);
export const searches = sqliteTable("searches", {
  ...common(),
  workspaceId: workspace(),
  query: text("query", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  cacheKey: text("cache_key").notNull(),
  status: text("status").notNull(),
  total: integer("total").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
});
export const results = sqliteTable(
  "search_results",
  {
    ...common(),
    workspaceId: workspace(),
    searchId: text("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    leadId: leadRef(),
  },
  (t) => [
    uniqueIndex("result_unique").on(t.searchId, t.leadId),
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
  ],
);
export const audits = sqliteTable(
  "website_audits",
  {
    ...common(),
    workspaceId: workspace(),
    leadId: leadRef(),
    data: text("data", { mode: "json" }).$type<Audit>().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
  ],
);
export const analyses = sqliteTable(
  "ai_analyses",
  {
    ...common(),
    workspaceId: workspace(),
    leadId: leadRef(),
    data: text("data", { mode: "json" }).$type<Analysis>().notNull(),
    evidenceHash: text("evidence_hash").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
  ],
);
export const scores = sqliteTable(
  "lead_scores",
  {
    ...common(),
    workspaceId: workspace(),
    leadId: leadRef(),
    data: text("data", { mode: "json" }).$type<Score>().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
  ],
);
export const messages = sqliteTable(
  "message_drafts",
  {
    ...common(),
    workspaceId: workspace(),
    leadId: leadRef(),
    text: text("text").notNull(),
    style: text("style").notNull(),
    method: text("method").notNull(),
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
  ],
);
export const activities = sqliteTable(
  "pipeline_activities",
  {
    ...common(),
    workspaceId: workspace(),
    leadId: leadRef(),
    text: text("text").notNull(),
    kind: text("kind").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
  ],
);
export const tasks = sqliteTable(
  "followup_tasks",
  {
    ...common(),
    workspaceId: workspace(),
    leadId: leadRef(),
    title: text("title").notNull(),
    dueAt: text("due_at").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
  ],
);
export const jobs = sqliteTable(
  "background_jobs",
  {
    ...common(),
    workspaceId: workspace(),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    status: text("status").notNull().default("pending"),
    progress: integer("progress").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextRunAt: integer("next_run_at").notNull().default(0),
    error: text("error"),
    result: text("result", { mode: "json" }).$type<unknown>(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (t) => [index("jobs_poll").on(t.status, t.nextRunAt)],
);
export const settings = sqliteTable("integration_settings", {
  ...common(),
  workspaceId: workspace().unique(),
  data: text("data", { mode: "json" }).$type<Settings>().notNull(),
  encryptedKey: text("encrypted_key"),
  encryptedSearchKey: text("encrypted_search_key"),
  encryptedOpenRouterKey: text("encrypted_openrouter_key"),
});
export const usage = sqliteTable("api_usage", {
  ...common(),
  workspaceId: workspace(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  tokens: integer("tokens").notNull().default(0),
});
export const suppression = sqliteTable(
  "suppression_list",
  {
    ...common(),
    workspaceId: workspace(),
    contact: text("contact").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [uniqueIndex("suppression_unique").on(t.workspaceId, t.contact)],
);
export const logs = sqliteTable("audit_logs", {
  ...common(),
  workspaceId: workspace(),
  action: text("action").notNull(),
  targetId: text("target_id"),
});
export type DbLead = typeof leads.$inferSelect;
export type NewLead = LeadInput;
