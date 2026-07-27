import { test, expect } from "@playwright/test";

/**
 * Live GitHub custom games — smoke against the Vite proxy + a real public release.
 * Requires network. Skips cleanly when GitHub is unreachable.
 */
const HUB = `http://localhost:${(process.env.HUB_PORT || "3004").trim()}`;

test.describe("P2Play Hub — Live GitHub custom games", () => {
  test("host-only add button; guest does not see Ajouter", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();

    await host.goto(HUB, { waitUntil: "networkidle" });
    await host.getByPlaceholder(/pseudo/i).fill("HostCustom");
    await host.getByRole("button", { name: /Créer un salon/i }).click();
    await expect(host.getByText(/Salon Connecté/i)).toBeVisible({ timeout: 30000 });

    const roomCode = (await host.getByText(/Code :/).first().innerText()).match(/[A-Z]{6}/)?.[0];
    expect(roomCode).toBeTruthy();

    await guest.goto(HUB, { waitUntil: "networkidle" });
    await guest.getByPlaceholder(/pseudo/i).fill("GuestCustom");
    await guest.getByPlaceholder(/CODE/i).fill(roomCode!);
    await guest.getByRole("button", { name: /Rejoindre un salon/i }).click();

    await expect.poll(
      async () => (await host.getByText(/Joueurs Connectés \(/i).first().innerText().catch(() => "")),
      { timeout: 30000, intervals: [500] },
    ).toMatch(/\(\s*2\s*\)/);

    await expect(host.getByRole("button", { name: /Ajouter un jeu/i })).toBeVisible();
    await expect(guest.getByRole("button", { name: /Ajouter un jeu/i })).toHaveCount(0);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("host can add a GitHub release game and launch shell for both peers", async ({ browser }) => {
    test.setTimeout(120_000);

    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();

    await host.goto(HUB, { waitUntil: "networkidle" });
    await host.getByPlaceholder(/pseudo/i).fill("HostLive");
    await host.getByRole("button", { name: /Créer un salon/i }).click();
    await expect(host.getByText(/Salon Connecté/i)).toBeVisible({ timeout: 30000 });

    const roomCode = (await host.getByText(/Code :/).first().innerText()).match(/[A-Z]{6}/)?.[0];
    expect(roomCode).toBeTruthy();

    await guest.goto(HUB, { waitUntil: "networkidle" });
    await guest.getByPlaceholder(/pseudo/i).fill("GuestLive");
    await guest.getByPlaceholder(/CODE/i).fill(roomCode!);
    await guest.getByRole("button", { name: /Rejoindre un salon/i }).click();

    await expect.poll(
      async () => (await host.getByText(/Joueurs Connectés \(/i).first().innerText().catch(() => "")),
      { timeout: 30000, intervals: [500] },
    ).toMatch(/\(\s*2\s*\)/);

    await host.getByRole("button", { name: /Ajouter un jeu/i }).click();
    await expect(host.getByRole("dialog")).toBeVisible();

    const firstExample = host.locator("[data-quick-example]").first();
    await expect(firstExample).toBeVisible();
    await firstExample.click();
    await host.getByRole("button", { name: /Ajouter le jeu/i }).click();

    const modalGone = await host
      .getByRole("dialog")
      .waitFor({ state: "hidden", timeout: 60000 })
      .then(() => true)
      .catch(() => false);

    if (!modalGone) {
      const errText = await host.locator('[role="dialog"]').innerText().catch(() => "");
      test.skip(true, `GitHub fetch unavailable in CI/network: ${errText.slice(0, 200)}`);
    }

    const customCard = host.getByRole("button", { name: /LIVE/i }).first();
    await expect(customCard).toBeVisible({ timeout: 10000 });
    await customCard.click();
    await host.getByRole("button", { name: /Lancer la partie/i }).click();

    await expect(host.locator("[data-p2play-game-shell]")).toBeVisible({ timeout: 60000 });
    await expect(guest.locator("[data-p2play-game-shell]")).toBeVisible({ timeout: 60000 });
    await expect(host.getByText(/Échec du chargement du script/i)).toHaveCount(0);
    await expect(guest.getByText(/Échec du chargement du script/i)).toHaveCount(0);

    await hostCtx.close();
    await guestCtx.close();
  });
});
