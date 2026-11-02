import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("login, descoberta, auditoria, IA, mensagem, CRM e layout responsivo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.log("BROWSER ERROR:", error.message);
  });
  await page.goto("/login");
  await page.getByLabel("Usuário", { exact: true }).fill("admin123");
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
  await page.getByRole("checkbox", { name: /Verificar sites antes/ }).uncheck();
  await page.getByRole("button", { name: "Buscar empresas" }).click();
  await page
    .getByRole("link", { name: "Abrir [TESTE] Oficina Aurora", exact: true })
    .click();
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
    page.getByRole("link", {
      name: "Abrir [TESTE] Empresa manual",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(
    page.getByLabel("Nome da empresa", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/settings/models", (route) =>
    route.fulfill({
      json: { models: [{ value: "test-model", label: "Modelo de teste" }] },
    }),
  );
  await page
    .getByLabel("Chave Gemini API (deixe vazio para preservar)", {
      exact: true,
    })
    .fill("test-key-only");
  await page
    .getByRole("button", { name: "Carregar modelos da minha conta" })
    .click();
  await page
    .getByLabel("Modelo de análise e mensagens", { exact: true })
    .selectOption("test-model");
  await page
    .getByLabel("Fonte da pesquisa", { exact: true })
    .selectOption("tavily");
  await page
    .getByLabel("Tavily API key (deixe vazio para preservar)", { exact: true })
    .fill("tvly-e2e-test-only");
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  const saved = await savedResponse;
  const savedInput = saved.request().postDataJSON();
  expect(savedInput).not.toHaveProperty("aiConfigured");
  expect(savedInput).not.toHaveProperty("searchConfigured");
  expect(savedInput).not.toHaveProperty("openrouterConfigured");
  expect(savedInput).not.toHaveProperty("groqConfigured");
  const savedSettings = await saved.json();
  expect(savedSettings.searchProvider).toBe("tavily");
  expect(savedSettings.searchConfigured).toBe(true);
  expect(JSON.stringify(savedSettings)).not.toContain("tvly-e2e-test-only");
  await expect(
    page.getByText("Configurações salvas", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Modelo de análise e mensagens", { exact: true }),
  ).toHaveValue("test-model");
  await expect(
    page.getByLabel("Tavily API key (deixe vazio para preservar)", {
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    page.getByText("Chave Tavily configurada.", { exact: false }),
  ).toBeVisible();
  // Saving an empty secret field must preserve the existing key.
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  await expect(
    page.getByText("Configurações salvas", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Chave Tavily configurada.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("IA da pesquisa", { exact: true })
    .selectOption("openrouter");
  await expect(
    page.getByLabel("Fonte da pesquisa", { exact: true }),
  ).toHaveValue("tavily");
  await expect(
    page.getByLabel("Fonte da pesquisa", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await expect(
    page.getByLabel("Modelo da pesquisa", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Modelo gratuito da pesquisa", { exact: true }),
  ).toHaveValue("openrouter/free");
  await page
    .getByLabel("OpenRouter API key (deixe vazio para preservar)", {
      exact: true,
    })
    .fill("sk-or-e2e-test-only");
  const openrouterResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  const openrouterSaved = await openrouterResponse;
  const openrouterInput = openrouterSaved.request().postDataJSON();
  expect(openrouterInput).not.toHaveProperty("aiConfigured");
  expect(openrouterInput).not.toHaveProperty("searchConfigured");
  expect(openrouterInput).not.toHaveProperty("openrouterConfigured");
  expect(openrouterInput).not.toHaveProperty("groqConfigured");
  const openrouterSettings = await openrouterSaved.json();
  expect(openrouterSettings.researchProvider).toBe("openrouter");
  expect(openrouterSettings.openrouterModel).toBe("openrouter/free");
  expect(openrouterSettings.openrouterConfigured).toBe(true);
  expect(openrouterSettings.model).toBe("test-model");
  expect(JSON.stringify(openrouterSettings)).not.toContain(
    "sk-or-e2e-test-only",
  );
  await expect(
    page.getByText("Configurações salvas", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("IA da pesquisa", { exact: true })).toHaveValue(
    "openrouter",
  );
  await expect(
    page.getByLabel("OpenRouter API key (deixe vazio para preservar)", {
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    page.getByText("Chave OpenRouter configurada.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  await expect(
    page.getByText("Configurações salvas", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Chave OpenRouter configurada.", { exact: false }),
  ).toBeVisible();
  await page.route("**/api/settings/test-research", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page
    .getByRole("button", {
      name: "Testar IA da pesquisa salva (consome 1 chamada)",
    })
    .click();
  await expect(
    page.getByText("Modelo de pesquisa respondeu", { exact: true }),
  ).toBeVisible();
  // Research availability depends on OpenRouter and Tavily, independently of the Gemini key.
  await page.route("**/api/settings", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: { ...openrouterSettings, aiConfigured: false },
      });
    }
    return route.continue();
  });
  await page
    .getByRole("link", { name: "Descobrir empresas", exact: true })
    .first()
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Buscar empresas" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Tavily + OpenRouter", { exact: false }),
  ).toBeVisible();
  await page.unroute("**/api/settings");
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Remover a chave OpenRouter salva ao salvar as configurações",
    })
    .check();
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  await expect(
    page.getByText("Falta configurar a chave OpenRouter para pesquisar.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Descobrir empresas", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Buscar empresas" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Configure a chave OpenRouter para pesquisar", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.getByLabel("IA da pesquisa", { exact: true }).selectOption("groq");
  await expect(
    page.getByLabel("Fonte da pesquisa", { exact: true }),
  ).toHaveValue("tavily");
  await expect(
    page.getByLabel("Fonte da pesquisa", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await expect(
    page.getByLabel("Modelo Groq da pesquisa", { exact: true }),
  ).toHaveValue("openai/gpt-oss-120b");
  await expect(
    page.getByRole("button", {
      name: "Testar IA da pesquisa salva (consome 1 chamada)",
    }),
  ).toBeDisabled();
  await page
    .getByLabel("Groq API key (deixe vazio para preservar)", { exact: true })
    .fill("gsk-e2e-dummy-only");
  const groqResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  const groqSaved = await groqResponse;
  const groqInput = groqSaved.request().postDataJSON();
  for (const flag of [
    "aiConfigured",
    "searchConfigured",
    "openrouterConfigured",
    "groqConfigured",
  ])
    expect(groqInput).not.toHaveProperty(flag);
  const groqSettings = await groqSaved.json();
  expect(groqSettings.researchProvider).toBe("groq");
  expect(groqSettings.groqModel).toBe("openai/gpt-oss-120b");
  expect(groqSettings.groqConfigured).toBe(true);
  expect(groqSettings.model).toBe("test-model");
  expect(JSON.stringify(groqSettings)).not.toContain("gsk-e2e-dummy-only");
  await page.reload();
  await expect(
    page.getByLabel("Groq API key (deixe vazio para preservar)", {
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    page.getByText("Chave Groq configurada.", { exact: false }),
  ).toBeVisible();
  // Empty Groq key fields preserve the encrypted key on an ordinary settings save.
  const groqPreservedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  const groqPreserved = await groqPreservedResponse;
  expect(groqPreserved.request().postDataJSON()).not.toHaveProperty(
    "groqApiKey",
  );
  expect((await groqPreserved.json()).groqConfigured).toBe(true);
  await page.reload();
  await page
    .getByRole("button", {
      name: "Testar IA da pesquisa salva (consome 1 chamada)",
    })
    .click();
  await expect(
    page.getByText("Modelo de pesquisa respondeu", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/groq-settings-mobile.png",
    fullPage: true,
  });
  const groqAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(groqAudit.violations.map((violation) => violation.id)).toEqual([]);
  await page.route("**/api/settings", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: { ...groqSettings, aiConfigured: false },
      });
    }
    return route.continue();
  });
  await page
    .getByRole("link", { name: "Descobrir empresas", exact: true })
    .first()
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Buscar empresas" }),
  ).toBeEnabled();
  await expect(page.getByText("Tavily + Groq", { exact: false })).toBeVisible();
  await page.unroute("**/api/settings");
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Remover a chave Groq salva ao salvar as configurações",
    })
    .check();
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  await expect(
    page.getByText("Falta configurar a chave Groq para pesquisar.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Descobrir empresas", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Buscar empresas" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Configure a chave Groq para pesquisar", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page
    .getByLabel("IA da pesquisa", { exact: true })
    .selectOption("gemini");
  await page
    .getByRole("checkbox", {
      name: "Remover a chave Tavily salva ao salvar as configurações",
    })
    .check();
  await page
    .getByRole("button", { name: "Salvar integrações e modelos" })
    .click();
  await expect(
    page.getByText("Falta configurar a chave Tavily para iniciar pesquisas.", {
      exact: false,
    }),
  ).toBeVisible();
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
