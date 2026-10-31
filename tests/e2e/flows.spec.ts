import { test, expect } from "@playwright/test";
test("login, descoberta, auditoria, IA, mensagem, CRM e layout responsivo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("e2e@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("E2E-only-password-123!");
  await page.getByRole("button", { name: "Entrar no workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Seu próximo cliente começa aqui." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Descobrir empresas", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Buscar empresas" }).click();
  await page.getByRole("link", { name: "[TESTE] Oficina Aurora" }).click();
  await expect(
    page.getByRole("heading", { name: "[TESTE] Oficina Aurora", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Auditar site", exact: true }).click();
  await expect(page.getByText("HTML auditado", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Analisar com Gemini", exact: true })
    .click();
  await expect(
    page.getByText("Análise simulada exclusivamente para teste E2E.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Etapa da empresa").selectOption("Qualificado");
  await expect(page.getByLabel("Etapa da empresa")).toHaveValue("Qualificado");
  await page.getByRole("link", { name: "Preparar abordagem" }).click();
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page.getByLabel("Mensagem comercial")).toContainText(
    "Oficina Aurora",
  );
  await page.getByRole("button", { name: "Aprovar esta versão" }).click();
  await expect(
    page.getByRole("button", { name: "Abrir no WhatsApp" }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await expect(page.getByLabel("Etapa de [TESTE] Oficina Aurora")).toHaveValue(
    "Qualificado",
  );
  await page
    .getByLabel("Etapa de [TESTE] Oficina Aurora")
    .selectOption("Cliente fechado");
  await page.reload();
  await expect(page.getByLabel("Etapa de [TESTE] Oficina Aurora")).toHaveValue(
    "Cliente fechado",
  );
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page.getByRole("button", { name: "Cadastrar empresa" }).click();
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .fill("[TESTE] Empresa manual");
  await page
    .getByRole("button", { name: "Salvar empresa", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "[TESTE] Empresa manual" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(
    page.getByLabel("Nome da empresa", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Seu próximo cliente começa aqui." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
