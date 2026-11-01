import { eq } from "drizzle-orm";
import { openDatabase, stamp } from "./db.js";
import { users, workspaces, members } from "./schema.js";
import { saveLead } from "../services/leads.js";
const { db, sqlite } = await openDatabase();
const admin = await db.select().from(users).get();
if (!admin)
  throw new Error(
    "Crie o administrador com npm run admin:create antes do seed.",
  );
let demo = await db
  .select()
  .from(workspaces)
  .where(eq(workspaces.demo, true))
  .get();
if (!demo) {
  demo = await db
    .insert(workspaces)
    .values({
      ...stamp(),
      name: "Demonstração · empresas fictícias",
      demo: true,
    })
    .returning()
    .get();
  await db
    .insert(members)
    .values({
      ...stamp(),
      workspaceId: demo.id,
      userId: admin.id,
      role: "admin",
    })
    .run();
}
for (const [name, category] of [
  ["Oficina Exemplo Aurora", "Oficinas mecânicas"],
  ["Restaurante Exemplo Horizonte", "Restaurantes"],
  ["Estúdio Exemplo Órbita", "Serviços"],
])
  await saveLead(
    db,
    demo.id,
    {
      name: `[DEMO] ${name}`,
      category,
      city: "Cidade fictícia",
      notes:
        "Registro inteiramente fictício para testar o produto. Sem telefone, endereço ou email reais.",
      tags: ["demonstração"],
      source: "Demonstração",
      sourceId: name,
    },
    true,
  );
sqlite.close();
console.log(
  "Demonstração criada em workspace separado. Nenhum lead real foi alterado.",
);
