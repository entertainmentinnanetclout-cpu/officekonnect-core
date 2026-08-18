import { expect, test, type Page } from "@playwright/test";

function captureRuntimeErrors(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  return failures;
}

test(
  "landing page exposes the current OfficeKonnect product without runtime errors",
  async ({ page }) => {
    const failures = captureRuntimeErrors(page);
    await page.goto("/");

    await expect(page).toHaveTitle("OfficeKonnect");
    await expect(
      page.getByRole("heading", { name: /One workspace for every office task/i }),
    ).toBeVisible();
    await expect(page.getByText("Connected office workspace")).toBeVisible();
    await expect(page.locator("#features")).toBeVisible();
    await expect(page.locator("#how")).toBeVisible();
    await expect(page.locator("#security")).toBeVisible();

    await page.getByRole("link", { name: "Features" }).click();
    await expect(page).toHaveURL(/#features$/);
    expect(failures).toEqual([]);
  },
);

test(
  "login route renders real authentication controls without runtime errors",
  async ({ page }) => {
    const failures = captureRuntimeErrors(page);
    await page.goto("/auth/login");

    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeEnabled();
    await expect(page.getByRole("link", { name: /Forgot password/i })).toBeVisible();
    expect(failures).toEqual([]);
  },
);

test("authentication layout remains usable on a mobile viewport", async ({ page }) => {
  const failures = captureRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/login");

  await expect(page.getByText("OfficeKonnect").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeInViewport();
  expect(failures).toEqual([]);
});

test("public legal routes remain directly reachable", async ({ page }) => {
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.locator("body")).toContainText("OfficeKonnect");
  }
});
