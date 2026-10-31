import { it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, stamp } from "../apps/api/src/database/db.js";
import { workspaces, leads } from "../apps/api/src/database/schema.js";
import { saveLead } from "../apps/api/src/services/leads.js";
import { leadInput } from "@jotage/shared";
it("preserva leads quando a conexão SQLite é fechada e reaberta", () => {
  const path = join(mkdtempSync(join(tmpdir(), "jotage-db-test-")), "test.db");
  const first = openDatabase(path),
    workspace = { ...stamp(), name: "Persistência" };
  first.db.insert(workspaces).values(workspace).run();
  const saved = saveLead(
    first.db,
    workspace.id,
    leadInput.parse({ name: "Empresa persistente" }),
  );
  first.sqlite.close();
  const second = openDatabase(path);
  expect(second.db.select().from(leads).get()?.id).toBe(saved.lead.id);
  second.sqlite.close();
});
