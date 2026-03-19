const { test, expect } = require('@playwright/test');
const { setHostId, seedUnit, openUnitsList } = require('./helpers');

const PEER_A = 'host-alpha';
const PEER_B = 'host-beta';
const CONNECTED_TIMEOUT = 15_000;

/** Opens a new browser context with a fixed peer ID. */
async function newPeerPage(browser, hostId) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setHostId(page, hostId);
  return { ctx, page };
}

/** B manually enters A's peer ID and clicks Connect, then waits for connection. */
async function connectBToA(pageB) {
  await pageB.locator('input[aria-label="Host ID"]').fill(PEER_A);
  await pageB.locator('.connect-btn').click();
  await expect(pageB.locator('.connect-panel__peer')).toBeVisible({ timeout: CONNECTED_TIMEOUT });
}

// ── 6. Manual connect ───────────────────────────────────────────────────────
test('manual connect', async ({ browser }) => {
  const { ctx: ctxA, page: pageA } = await newPeerPage(browser, PEER_A);
  const { ctx: ctxB, page: pageB } = await newPeerPage(browser, PEER_B);

  await Promise.all([pageA.goto('/connect'), pageB.goto('/connect')]);
  
  // Manual debugging pause - remove when done
  // await new Promise(r => setTimeout(r, 600_000));

  await connectBToA(pageB);

  // Both sides show the connected state
  await expect(pageA.locator('.connect-panel__peer')).toBeVisible({ timeout: CONNECTED_TIMEOUT });

  await ctxA.close();
  await ctxB.close();
});

// ── 7. Sync A → B ───────────────────────────────────────────────────────────
test('sync A to B', async ({ browser }) => {
  const { ctx: ctxA, page: pageA } = await newPeerPage(browser, PEER_A);
  const { ctx: ctxB, page: pageB } = await newPeerPage(browser, PEER_B);

  // Seed a unit on A
  await pageA.goto('/');
  await seedUnit(pageA, {
    uid: 'sync-a-to-b',
    type: 'snippet',
    content: 'From device A',
    createdAt: new Date().toISOString(),
  });

  await Promise.all([pageA.goto('/connect'), pageB.goto('/connect')]);
  await connectBToA(pageB);

  // B initiates sync
  await pageB.locator('.mirror-sync__btn').click();
  await expect(pageB.locator('.mirror-sync__btn')).toContainText(/Synced|added/, { timeout: CONNECTED_TIMEOUT });

  // Navigate back and verify B has A's unit
  await pageB.goto('/');
  await openUnitsList(pageB);
  await expect(pageB.locator('.bleed-card__text').first()).toContainText('From device A');

  await ctxA.close();
  await ctxB.close();
});

// ── 8. Sync B → A ───────────────────────────────────────────────────────────
test('sync B to A', async ({ browser }) => {
  const { ctx: ctxA, page: pageA } = await newPeerPage(browser, PEER_A);
  const { ctx: ctxB, page: pageB } = await newPeerPage(browser, PEER_B);

  // Seed a unit on B
  await pageB.goto('/');
  await seedUnit(pageB, {
    uid: 'sync-b-to-a',
    type: 'snippet',
    content: 'From device B',
    createdAt: new Date().toISOString(),
  });

  await Promise.all([pageA.goto('/connect'), pageB.goto('/connect')]);
  await connectBToA(pageB);

  // A initiates sync
  await pageA.locator('.mirror-sync__btn').click();
  await expect(pageA.locator('.mirror-sync__btn')).toContainText(/Synced|added/, { timeout: CONNECTED_TIMEOUT });

  // Navigate back and verify A has B's unit
  await pageA.goto('/');
  await openUnitsList(pageA);
  await expect(pageA.locator('.bleed-card__text').first()).toContainText('From device B');

  await ctxA.close();
  await ctxB.close();
});

// ── 9. Bidirectional sync ───────────────────────────────────────────────────
test('bidirectional sync: both devices end up with all units', async ({ browser }) => {
  const { ctx: ctxA, page: pageA } = await newPeerPage(browser, PEER_A);
  const { ctx: ctxB, page: pageB } = await newPeerPage(browser, PEER_B);

  // Seed unique units on each device
  await pageA.goto('/');
  await seedUnit(pageA, {
    uid: 'bidir-unit-a',
    type: 'snippet',
    content: 'Unit from A',
    createdAt: new Date().toISOString(),
  });

  await pageB.goto('/');
  await seedUnit(pageB, {
    uid: 'bidir-unit-b',
    type: 'snippet',
    content: 'Unit from B',
    createdAt: new Date().toISOString(),
  });

  await Promise.all([pageA.goto('/connect'), pageB.goto('/connect')]);
  await connectBToA(pageB);

  // A syncs (bidirectional: A sends its units, gets B's back)
  await pageA.locator('.mirror-sync__btn').click();
  await expect(pageA.locator('.mirror-sync__btn')).toContainText(/Synced|added/, { timeout: CONNECTED_TIMEOUT });

  // Both should have 2 units
  await pageA.goto('/');
  await openUnitsList(pageA);
  await expect(pageA.locator('.bleed-card')).toHaveCount(2);

  await pageB.goto('/');
  await openUnitsList(pageB);
  await expect(pageB.locator('.bleed-card')).toHaveCount(2);

  await ctxA.close();
  await ctxB.close();
});

// ── 10. Mirror text syncs between peers ────────────────────────────────────
test('mirror text syncs between peers', async ({ browser }) => {
  const { ctx: ctxA, page: pageA } = await newPeerPage(browser, PEER_A);
  const { ctx: ctxB, page: pageB } = await newPeerPage(browser, PEER_B);

  await Promise.all([pageA.goto('/connect'), pageB.goto('/connect')]);
  await connectBToA(pageB);

  // A types in the mirror textarea
  await pageA.locator('.mirror__textarea').fill('Hello from A');
  // B should see the same text
  await expect(pageB.locator('.mirror__textarea')).toHaveValue('Hello from A', { timeout: 10_000 });

  await ctxA.close();
  await ctxB.close();
});
