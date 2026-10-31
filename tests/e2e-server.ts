// This test-only entry point injects providers. Production never enables mocks through environment flags.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { buildApp } from "../apps/api/src/app.js";
import { hashPassword } from "../apps/api/src/security/crypto.js";
import { parsePage } from "../apps/api/src/services/audit.js";
import { users, workspaces, members } from "../apps/api/src/database/schema.js";
import { leadInput, type Analysis } from "@jotage/shared";
const directory = mkdtempSync(join(tmpdir(), "jotage-e2e-"));
const { db, sqlite } = openDatabase(join(directory, "test.db"));
const user = {
  ...stamp(),
  email: "e2e@example.test",
  passwordHash: await hashPassword("E2E-only-password-123!"),
};
const workspace = {
  ...stamp(),
  name: "Teste E2E · dados fictícios",
  demo: true,
};
db.insert(users).values(user).run();
db.insert(workspaces).values(workspace).run();
db.insert(members)
  .values({ ...stamp(), userId: user.id, workspaceId: workspace.id })
  .run();
const analysis: Analysis = {
  businessSummary: "Análise simulada exclusivamente para teste E2E.",
  opportunities: [],
  recommendedService: "Verificação técnica",
  suggestedApproach: "Solicitar permissão para conversar.",
  limitations: ["Provedor substituído por mock neste servidor de teste."],
};
const { app } = await buildApp(db, {
  search: {
    search: async () => [
      leadInput.parse({
        name: "[TESTE] Oficina Aurora",
        category: "Oficinas mecânicas",
        website: "https://example.com",
        source: "Mock E2E",
        sourceId: "mock-1",
      }),
    ],
  },
  auditor: {
    audit: async () =>
      parsePage({
        status: 200,
        url: "https://example.com",
        contentType: "text/html",
        text: "<html><head><title>Teste fictício</title></head><body><h1>Empresa teste</h1></body></html>",
      }),
  },
  ai: {
    analyzeBusiness: async () => analysis,
    generateOutreach: async () =>
      "Olá! Esta é uma mensagem simulada para o teste automatizado. Podemos apresentar uma ideia?",
  },
});
await app.listen({ host: "127.0.0.1", port: 3101 });
process.on(
  "SIGTERM",
  () =>
    void app.close().then(() => {
      sqlite.close();
      process.exit(0);
    }),
);
