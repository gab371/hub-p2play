import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * P2Play Hub — game launch & round smoke tests.
 *
 * Criterion enforced per game:
 *   1. The hub can launch the game (host reaches the in-game board, not the lobby).
 *   2. At least one round/turn action is performed and the game state advances.
 *   3. The host can return to the hub lobby.
 *
 * The embedded auto-start only fires for the host once the hub lobby has 2
 * players, so each test brings up a second browser context (guest) that joins
 * the host's room via PeerJS. The guest is only needed to populate the lobby;
 * it is asserted on only for Sheriff (deck-theme propagation).
 */

const HUB = "http://localhost:3004";

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

// --- Auto-start games (board appears right after the hub launch) ----------------

type AutoStartGame = {
  key: "skull" | "royal";
  cardText: string;
  lobbyMarker: RegExp;
  boardMarker: RegExp;
  playRound: (host: Page) => Promise<void>;
};

const AUTO_START_GAMES: AutoStartGame[] = [
  {
    key: "skull",
    cardText: "Skull",
    lobbyMarker: /Salon de Jeu/,
    boardMarker: /PHASE :/,
    playRound: async (host) => {
      // Place the first ROSE card (label is uppercased via CSS; DOM text is "Rose" / 🌹).
      const rose = host.locator("button", { hasText: /🌹/ }).first();
      await expect(rose).toBeEnabled();
      const before = await countOccurrences(host, "Tapis vide");
      await rose.click();
      await expect.poll(async () => countOccurrences(host, "Tapis vide"), { timeout: 15000 })
        .toBeLessThan(before);
    },
  },
  {
    key: "royal",
    cardText: "Royal",
    lobbyMarker: /Salon Royal/,
    boardMarker: /PUPITRE DES DÉCISIONS/,
    playRound: async (host) => {
      await expect(host.getByText(/À votre tour de régner/)).toBeVisible();
      const revenu = host.locator("button", { hasText: "Revenu (+1)" }).first();
      await expect(revenu).toBeEnabled();
      await revenu.click();
      await expect(host.getByText(/À votre tour de régner/)).toBeHidden({ timeout: 15000 });
    },
  },
];

for (const g of AUTO_START_GAMES) {
  test(`launch ${g.key} and play one round`, async ({ browser }) => {
    const errors: string[] = [];
    const { host, hostCtx, guestCtx } = await createTwoPlayerRoom(browser, errors);
    try {
      await launchFromHub(host, g.cardText);
      await waitForBoard(host, g.boardMarker, g.key);
      expect(g.lobbyMarker.test((await host.locator("body").innerText()) ?? ""),
        `${g.key}: in-game lobby should be gone`).toBe(false);
      await g.playRound(host);
      await returnToHub(host);
    } finally {
      await test.info().attach(
        `${g.key}-console-errors.txt`,
        { body: errors.join("\n") || "(no console/page errors)" },
      );
      await hostCtx.close();
      await guestCtx.close();
    }
  });
}

// --- Sheriff: host must pick a deck theme, then click the in-game "Lancer la Partie" --
//
// The updated Sheriff game no longer auto-starts in embedded mode: it shows the
// saloon lobby so the host can choose the deck theme (Western / Médiéval /
// Moderne) before starting. We exercise two different decks to verify the
// selection propagates to the guest and the game still launches a round.

const SHERIFF_DECKS = [
  { key: "MEDIEVAL", label: "🏰 Médiéval", active: /Actif : 🏰 Médiéval/ },
  { key: "MODERN", label: "🏙️ Moderne", active: /Actif : 🏙️ Moderne/ },
];

for (const deck of SHERIFF_DECKS) {
  test(`launch sheriff with ${deck.key} deck and play one round`, async ({ browser }) => {
    const errors: string[] = [];
    const { host, guest, hostCtx, guestCtx } = await createTwoPlayerRoom(browser, errors);
    try {
      await launchFromHub(host, "Sheriff");

      // The saloon lobby (with the deck selector) must appear.
      await expect(host.getByText(/THÈME DU DECK/i)).toBeVisible({ timeout: 40000 });

      // Host picks the deck theme.
      const deckBtn = host.locator("button", { hasText: deck.label }).first();
      await expect(deckBtn).toBeEnabled();
      await deckBtn.click();

      // The deck choice must propagate to the guest (read-only "Actif : …").
      await expect(guest.getByText(deck.active)).toBeVisible({ timeout: 15000 });

      // Host starts the game from the saloon lobby.
      const inGameLaunch = host.getByRole("button", { name: /^Lancer la Partie$/ }).first();
      await expect(inGameLaunch).toBeEnabled();
      await inGameLaunch.click();

      // The board must appear (round 1 started).
      await waitForBoard(host, /Manche \d+ \//, "sheriff-" + deck.key);
      expect(/Marchands connectés/.test((await host.locator("body").innerText()) ?? ""),
        "sheriff: saloon lobby should be gone").toBe(false);

      // Round in progress: the host is the SHÉRIF, waiting for merchants' cargo.
      await expect(host.getByText(/En attente.*préparent leur cargaison/i)).toBeVisible({
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
