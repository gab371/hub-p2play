import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * P2Play Hub — game launch & round smoke tests.
 *
 * Criterion enforced per game:
 *   1. The hub can launch the game (host reaches the in-game board, not the lobby).
 *   2. At least one round/turn action is performed and the game state advances.
 *   3. The host can return to the hub lobby.
 *
 * Embedded games no longer auto-start: each shows a pre-game lobby (roles /
 * deck / theme) that the host must configure before starting. Tests bring up a
 * second browser context (guest) so the hub lobby has 2 players, then exercise
 * guest ready (when gated) + host in-game "Lancer la partie".
 */

const HUB = `http://localhost:${(process.env.HUB_PORT || "3004").trim()}`;

async function countOccurrences(page: Page, needle: string): Promise<number> {
  const text = (await page.locator("body").innerText()) ?? "";
  let n = 0;
  let i = 0;
  while ((i = text.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}

/** Collect console errors / page errors on a page (informational; non-fatal). */
function collectErrors(page: Page, label: string, sink: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") sink.push(`[${label} console] ${m.text()}`);
  });
  page.on("pageerror", (e) => sink.push(`[${label} pageerror] ${String(e?.message ?? e)}`));
}

/** Create a hub room with a host + a guest that has joined via PeerJS. */
async function createTwoPlayerRoom(browser: Browser, errors: string[]) {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  collectErrors(host, "host", errors);
  collectErrors(guest, "guest", errors);

  // Host creates the room.
  await host.goto(HUB, { waitUntil: "networkidle" });
  await host.getByPlaceholder(/pseudo/i).fill("Host");
  await host.getByRole("button", { name: /Créer un salon/i }).click();
  await expect(host.getByText(/Salon Connecté/i)).toBeVisible({ timeout: 30000 });

  const codeText = (await host.getByText(/Code :/).first().innerText()).match(/[A-Z]{6}/);
  const roomCode = codeText?.[0];
  expect(roomCode, "room code should be a 6-letter code").toBeTruthy();

  // Guest joins the room.
  await guest.goto(HUB, { waitUntil: "networkidle" });
  await guest.getByPlaceholder(/pseudo/i).fill("Guest");
  await guest.getByPlaceholder(/CODE/i).fill(roomCode!);
  await guest.getByRole("button", { name: /Rejoindre un salon/i }).click();

  // Wait until the host's hub lobby reports 2 connected players.
  await expect.poll(
    async () => {
      const m = (await host.getByText(/Joueurs Connectés \(/i).first().innerText().catch(() => "")) ?? "";
      return /\(\s*2\s*\)/.test(m);
    },
    { timeout: 30000, intervals: [500] },
    "host hub should list 2 connected players after guest joins",
  ).toBe(true);

  return { host, guest, roomCode: roomCode!, hostCtx, guestCtx };
}

/** Hub-level launch: select a game card and click the hub "Lancer la partie". */
async function launchFromHub(host: Page, cardText: string) {
  await host.locator("button", { hasText: cardText }).first().click();
  await host.getByRole("button", { name: /Lancer la partie/i }).click();
}

/** Wait until a board marker regex matches the host body text. */
async function waitForBoard(host: Page, marker: RegExp, label: string) {
  await expect.poll(
    async () => marker.test((await host.locator("body").innerText()) ?? ""),
    { timeout: 40000, intervals: [500] },
    `${label}: host should reach the in-game board (marker ${marker})`,
  ).toBe(true);
}

/** Return to the hub lobby via the top-left button. */
async function returnToHub(host: Page) {
  await host.getByRole("button", { name: /← Lobby P2Play/ }).click();
  await expect(host.getByText(/Sélectionner un jeu/i)).toBeVisible({ timeout: 15000 });
}

// --- Skull: host configures roles, guest must ready, then host starts ----------------
//
// Skull no longer auto-starts in embedded mode: it shows the "Salon de Jeu"
// lobby so players can pick Joueur / Spectateur before starting. The host's
// "Lancer la partie" is gated on all players being ready.

test("launch skull and play one round", async ({ browser }) => {
  const errors: string[] = [];
  const { host, guest, hostCtx, guestCtx } = await createTwoPlayerRoom(browser, errors);
  try {
    await launchFromHub(host, "Skull");

    // Role-selection lobby must appear (not the in-game board).
    await expect(host.getByText(/Salon de Jeu/)).toBeVisible({ timeout: 40000 });
    await expect(host.getByText(/R.LE.*JOUEUR.*SPECTATEUR/i)).toBeVisible({ timeout: 15000 });

    // Guest must ready up before the host can start.
    const readyBtn = guest.getByRole("button", { name: /Je suis Prêt/i }).first();
    await expect(readyBtn).toBeEnabled({ timeout: 15000 });
    await readyBtn.click();

    // Host starts from the skull lobby (enabled once guest is ready).
    const inGameLaunch = host.getByRole("button", { name: /Lancer la partie/i }).first();
    await expect(inGameLaunch).toBeEnabled({ timeout: 15000 });
    await inGameLaunch.click();

    // Board marker uses CSS uppercase ("Phase :" → "PHASE :").
    await waitForBoard(host, /PHASE\s*:/i, "skull");
    expect(/Salon de Jeu/.test((await host.locator("body").innerText()) ?? ""),
      "skull: in-game lobby should be gone").toBe(false);

    // Place the first ROSE card (label is uppercased via CSS; DOM text is "Rose" / 🌹).
    const rose = host.locator("button", { hasText: /🌹/ }).first();
    await expect(rose).toBeEnabled();
    const before = await countOccurrences(host, "Tapis vide");
    await rose.click();
    await expect.poll(async () => countOccurrences(host, "Tapis vide"), { timeout: 15000 })
      .toBeLessThan(before);

    await returnToHub(host);
  } finally {
    await test.info().attach(
      "skull-console-errors.txt",
      { body: errors.join("\n") || "(no console/page errors)" },
    );
    await hostCtx.close();
    await guestCtx.close();
  }
});

// --- Royal: host must pick a deck, guest must ready, then host starts ----------------
//
// The updated Royal Bluff no longer auto-starts in embedded mode: it shows the
// "Salon Royal" lobby so the host can choose the deck (Coup Classique /
// Coup : Réformation) before starting. The host's "Lancer la partie" is gated
// on all players being ready, so the guest must click "Je suis Prêt !" first.
// We exercise both decks to verify the selection propagates to the guest and
// the game still launches a round.

const ROYAL_DECKS = [
  { key: "CLASSIC", label: "Coup Classique", active: /Actif : Coup Classique/ },
  { key: "REFORMATION", label: "Coup : Réformation", active: /Actif : Coup : Réformation/ },
];

for (const deck of ROYAL_DECKS) {
  test(`launch royal with ${deck.key} deck and play one round`, async ({ browser }) => {
    const errors: string[] = [];
    const { host, guest, hostCtx, guestCtx } = await createTwoPlayerRoom(browser, errors);
    try {
      await launchFromHub(host, "Royal");

      // The royal lobby (with the deck selector) must appear.
      await expect(host.getByText(/Salon Royal/)).toBeVisible({ timeout: 40000 });

      // Host picks the deck.
      const deckBtn = host.locator("button", { hasText: deck.label }).first();
      await expect(deckBtn).toBeEnabled();
      await deckBtn.click();

      // The deck choice must propagate to the guest (read-only "Actif : …").
      await expect(guest.getByText(deck.active)).toBeVisible({ timeout: 15000 });

      // Guest must ready up before the host can start.
      const readyBtn = guest.getByRole("button", { name: /Je suis Prêt/i }).first();
      await expect(readyBtn).toBeEnabled();
      await readyBtn.click();

      // Host starts the game from the royal lobby (enabled once guest is ready).
      const inGameLaunch = host.getByRole("button", { name: /Lancer la partie/i }).first();
      await expect(inGameLaunch).toBeEnabled({ timeout: 15000 });
      await inGameLaunch.click();

      // The board must appear (round 1 started).
      await waitForBoard(host, /PUPITRE DES DÉCISIONS/, "royal-" + deck.key);
      expect(/Conspirateurs connectés/.test((await host.locator("body").innerText()) ?? ""),
        "royal: salon lobby should be gone").toBe(false);

      // Round in progress: the host is the active monarch.
      await expect(host.getByText(/À votre tour de régner/)).toBeVisible({ timeout: 15000 });
      const revenu = host.locator("button", { hasText: "Revenu (+1)" }).first();
      await expect(revenu).toBeEnabled();
      await revenu.click();
      await expect(host.getByText(/À votre tour de régner/)).toBeHidden({ timeout: 15000 });

      await returnToHub(host);
    } finally {
      await test.info().attach(
        `royal-${deck.key}-console-errors.txt`,
        { body: errors.join("\n") || "(no console/page errors)" },
      );
      await hostCtx.close();
      await guestCtx.close();
    }
  });
}

// --- Sheriff: host picks a deck theme, guest readies, then host starts ----------
//
// Sheriff v0.3.0 no longer auto-starts in embedded mode: it shows the
// "Saloon des Marchands" lobby so the host can choose the deck theme
// (Far West / Médiéval / Moderne). Launch is gated on all guests being ready
// (same pattern as Skull / Royal). Guests no longer see a read-only "Actif"
// line for the theme — only the host sees the selector.

const SHERIFF_DECKS = [
  { key: "MEDIEVAL", label: /Médiéval/ },
  { key: "MODERN", label: /Moderne/ },
];

for (const deck of SHERIFF_DECKS) {
  test(`launch sheriff with ${deck.key} deck and play one round`, async ({ browser }) => {
    const errors: string[] = [];
    const { host, guest, hostCtx, guestCtx } = await createTwoPlayerRoom(browser, errors);
    try {
      await launchFromHub(host, "Sheriff");

      // The saloon lobby (with the deck selector) must appear.
      await expect(host.getByText(/Saloon des Marchands/i)).toBeVisible({ timeout: 40000 });
      await expect(host.getByText(/paquet/i)).toBeVisible({ timeout: 15000 });

      // Host picks the deck theme.
      const deckBtn = host.locator("button", { hasText: deck.label }).first();
      await expect(deckBtn).toBeEnabled();
      await deckBtn.click();

      // Guest must ready up before the host can start.
      const readyBtn = guest.getByRole("button", { name: /Je suis pr/i }).first();
      await expect(readyBtn).toBeEnabled({ timeout: 15000 });
      await readyBtn.click();

      // Host starts from the saloon lobby (enabled once guest is ready).
      const inGameLaunch = host.getByRole("button", { name: /Lancer la partie/i }).first();
      await expect(inGameLaunch).toBeEnabled({ timeout: 15000 });
      await inGameLaunch.click();

      // The board must appear (round 1 started).
      await waitForBoard(host, /Manche \d+ \//, "sheriff-" + deck.key);
      expect(/Saloon des Marchands/.test((await host.locator("body").innerText()) ?? ""),
        "sheriff: saloon lobby should be gone").toBe(false);

      // Round in progress: the host is the SHÉRIF, waiting for merchants' cargo.
      await expect(host.getByText(/En attente.*pr.parent leur cargaison/i)).toBeVisible({
        timeout: 15000,
      });

      await returnToHub(host);
    } finally {
      await test.info().attach(
        `sheriff-${deck.key}-console-errors.txt`,
        { body: errors.join("\n") || "(no console/page errors)" },
      );
      await hostCtx.close();
      await guestCtx.close();
    }
  });
}

test("Room URL Sharing — auto-fills room code & copy link works", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  try {
    // 1. Host creates room
    await host.goto(HUB, { waitUntil: "networkidle" });
    await host.getByPlaceholder(/pseudo/i).fill("HostURL");
    await host.getByRole("button", { name: /Créer un salon/i }).click();
    await expect(host.getByText(/Salon Connecté/i)).toBeVisible({ timeout: 30000 });

    // 2. Extract code & click Copy Link
    const codeText = (await host.getByText(/Code :/).first().innerText()).match(/[A-Z0-9]{6}/);
    const roomCode = codeText?.[0];
    expect(roomCode).toBeTruthy();

    const copyBtn = host.getByRole("button", { name: /Copier le lien/i });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await expect(host.getByRole("button", { name: /Lien copié/i })).toBeVisible();

    // 3. Guest opens URL with #/ROOMCODE directly
    const directUrl = `${HUB}/#/${roomCode}`;
    await guest.goto(directUrl, { waitUntil: "networkidle" });

    // 4. Verify Invitation panel & code display
    await expect(guest.getByText(/Invitation au Salon/i)).toBeVisible();
    await expect(guest.getByText(roomCode!)).toBeVisible();

    // 5. Test back button returns to normal home view
    const backBtn = guest.getByRole("button", { name: /Créer un salon ou entrer un autre code/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(guest.getByRole("button", { name: /Créer un salon/i })).toBeVisible();
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});
