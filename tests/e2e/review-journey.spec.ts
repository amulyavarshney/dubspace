import { expect, test, type Page } from "@playwright/test";
import { synthWav } from "../../src/server/providers/mock/adapter";

const PASSWORD = "password123";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/projects/);
}

/**
 * Each journey creates its own project/segment through the public API so the suite is
 * repeatable against the same seeded database.
 */
async function createFixture(page: Page, opts: { assignTo?: string } = {}) {
  const api = page.request;
  const project = await (await api.post("/api/v1/projects", { data: { name: `E2E ${Date.now()}`, targetLocales: ["de"], videos: [{ title: "Clip" }] } })).json();
  const detail = await (await api.get(`/api/v1/projects/${project.id}`)).json();
  const videoId = detail.project.videos[0].id as string;
  const segment = await (await api.post(`/api/v1/projects/${project.id}/segments`, { data: { videoId, locale: "de", startMs: 0, endMs: 4000, script: "Willkommen zurück in der Stadt.", externalId: "E2E-1" } })).json();
  if (opts.assignTo) {
    const users = await (await api.get(`/api/v1/projects/${project.id}/assignable-users`)).json();
    const actor = users.items.find((u: { email: string }) => u.email === opts.assignTo);
    expect(actor, `actor ${opts.assignTo} must exist in the seed`).toBeTruthy();
    const res = await api.post(`/api/v1/segments/${segment.id}/assignments`, { data: { actorUserId: actor.id, dueAt: new Date(Date.now() + 86400000).toISOString() } });
    expect(res.ok(), `assignment failed: ${res.status()} ${await res.text()}`).toBe(true);
  }
  return { projectId: project.id as string, segmentId: segment.id as string, href: `/projects/${project.id}/segments/${segment.id}` };
}

async function uploadTake(page: Page, name: string, seconds: number) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose file|Upload another|Try again/ }).click();
  await (await chooser).setFiles({ name, mimeType: "audio/wav", buffer: Buffer.from(synthWav({ seconds, freq: 200, words: 5 })) });
}

test.describe("editor and actor journey", () => {
  test("manager assigns, actor uploads, editor requests revision, actor re-uploads, editor approves", async ({ page, browser }) => {
    await signIn(page, "manager@dubspace.test");
    const fx = await createFixture(page, { assignTo: "jonas.actor@dubspace.test" });

    // Actor sees the assignment and uploads v1.
    const actorCtx = await browser.newContext();
    const actor = await actorCtx.newPage();
    await signIn(actor, "jonas.actor@dubspace.test");
    await actor.goto("/my-assignments");
    await expect(actor.getByText("Willkommen zurück in der Stadt.").first()).toBeVisible();
    await actor.goto(fx.href);
    await uploadTake(actor, "take-1.wav", 2);
    await expect(actor.getByText("Awaiting review").first()).toBeVisible({ timeout: 45_000 });
    await expect(actor.getByRole("button", { name: "Approve" })).toHaveCount(0);

    // Editor comments and requests a revision (reason required).
    const editorCtx = await browser.newContext();
    const editor = await editorCtx.newPage();
    await signIn(editor, "editor@dubspace.test");
    await editor.goto(fx.href);
    await expect(editor.getByText("In review").first()).toBeVisible({ timeout: 20_000 });
    await editor.getByLabel("New comment").fill("Slow down the opening phrase.");
    await editor.getByRole("button", { name: "Post comment" }).click();
    await expect(editor.getByText("Slow down the opening phrase.")).toBeVisible();
    await editor.getByRole("button", { name: "Request revision" }).click();
    await editor.getByLabel("Reason (required)").fill("Pacing: slow down the first phrase.");
    await editor.getByRole("dialog").getByRole("button", { name: "Request revision" }).click();
    await expect(editor.getByText("Changes requested").first()).toBeVisible({ timeout: 20_000 });

    // Actor uploads v2.
    await actor.reload();
    await expect(actor.getByText("Changes requested").first()).toBeVisible();
    await uploadTake(actor, "take-2.wav", 2.5);
    await expect(actor.getByText("Awaiting review").first()).toBeVisible({ timeout: 45_000 });

    // Editor approves v2; v1 feedback stays historical.
    await editor.reload();
    await expect(editor.getByLabel("Recording")).toContainText("v2");
    await editor.getByRole("button", { name: "Approve" }).click();
    await editor.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expect(editor.getByText("Approved version")).toBeVisible({ timeout: 20_000 });
    await editor.getByLabel("Recording").selectOption({ index: 1 });
    await expect(editor.getByText("Slow down the opening phrase.")).toBeVisible();
    await expect(editor.getByText(/viewing feedback on an earlier version/i)).toBeVisible();

    // Dashboard reflects progress.
    await editor.goto(`/projects/${fx.projectId}`);
    await expect(editor.getByText("100%").first()).toBeVisible();
    await actorCtx.close();
    await editorCtx.close();
  });

  test("actor cannot see segments they are not assigned to", async ({ page, browser }) => {
    await signIn(page, "manager@dubspace.test");
    const fx = await createFixture(page); // unassigned
    const actorCtx = await browser.newContext();
    const actor = await actorCtx.newPage();
    await signIn(actor, "maria.actor@dubspace.test");
    const res = await actor.request.get(`/api/v1/segments/${fx.segmentId}`);
    expect(res.status()).toBe(404);
    await actor.goto(fx.href);
    await expect(actor.getByText(/not found|could not be found/i).first()).toBeVisible();
    await actorCtx.close();
  });

  test("owner configures a mock provider and an editor generates a reviewable AI draft", async ({ page, browser }) => {
    await signIn(page, "owner@dubspace.test");
    const fx = await createFixture(page);
    await page.goto("/settings/ai-providers");
    await expect(page.getByText("The API key is encrypted and cannot be viewed after saving.")).toBeVisible();
    const mockCard = page.locator("section", { hasText: "Mock provider" });
    await mockCard.getByLabel(/API key/).fill("mock-e2e-key-12345");
    await mockCard.getByRole("button", { name: /^(Save|Replace)$/ }).first().click();
    await expect(mockCard.getByText("••••••••2345")).toBeVisible();
    await mockCard.getByRole("button", { name: "Test connection" }).click();
    await expect(mockCard.getByText("Mock provider connected").first()).toBeVisible();
    const res = await page.request.get("/api/v1/settings/ai-providers");
    expect(await res.text()).not.toContain("mock-e2e-key");

    const editorCtx = await browser.newContext();
    const editor = await editorCtx.newPage();
    await signIn(editor, "editor@dubspace.test");
    await editor.goto(fx.href);
    await editor.getByRole("button", { name: "Generate AI draft" }).click();
    await editor.getByRole("option", { name: /Bass/ }).click();
    await editor.getByRole("button", { name: "Generate draft" }).click();
    await expect(editor.getByText("AI generated").first()).toBeVisible({ timeout: 45_000 });
    // Opening the latest submitted version as a reviewer moves it to "In review".
    await expect(editor.getByText(/Awaiting review|In review/).first()).toBeVisible({ timeout: 20_000 });
    await expect(editor.getByRole("button", { name: "Approve" })).toBeEnabled();
    await editorCtx.close();
  });

  test("unauthenticated and cross-tenant API access is refused", async ({ page, request }) => {
    const anon = await request.get("/api/v1/projects");
    expect(anon.status()).toBe(401);
    await signIn(page, "manager@dubspace.test");
    const fx = await createFixture(page);
    const outsiderCtx = await page.context().browser()!.newContext();
    const outsider = await outsiderCtx.newPage();
    await signIn(outsider, "outsider@dubspace.test");
    expect((await outsider.request.get(`/api/v1/projects/${fx.projectId}`)).status()).toBe(404);
    expect((await outsider.request.get(`/api/v1/segments/${fx.segmentId}`)).status()).toBe(404);
    const list = (await (await outsider.request.get("/api/v1/projects")).json()) as { items: Array<{ id: string }> };
    expect(list.items.some((p) => p.id === fx.projectId)).toBe(false);
    await outsiderCtx.close();
  });
});
