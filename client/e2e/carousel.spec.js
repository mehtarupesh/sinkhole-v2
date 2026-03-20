const { test, expect } = require('@playwright/test');
const { seedUnit } = require('./helpers');

// Seeds units with deterministic, staggered createdAt values
async function seedUnits(page, count = 6) {
  const base = Date.now();
  for (let i = 1; i <= count; i++) {
    await seedUnit(page, {
      uid: `carousel-uid-${i}`,
      type: 'snippet',
      content: `Carousel unit ${i}`,
      createdAt: base + i * 1000, // i=1 is oldest, i=count is newest
    });
  }
}

// Returns all visible carousel cards on the landing page
function getCarouselCards(page) {
  return page.locator('.bleed-card');
}

// ── 1. Opening a carousel card shows UnitDetail with nav ─────────────────────
test('clicking a carousel card opens unit detail with nav', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const cards = getCarouselCards(page);
  await cards.first().waitFor({ state: 'visible' });
  await cards.first().click();

  await expect(page.locator('.units-panel')).toBeVisible();
  await expect(page.locator('[data-testid="unit-detail-nav"]')).toBeVisible();
});

// ── 2. Nav counter shows current position ────────────────────────────────────
test('nav counter shows position within carousel', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const firstCarouselCards = page.locator('.carousel').first().locator('.bleed-card');
  await firstCarouselCards.first().waitFor({ state: 'visible' });

  const cardCount = await firstCarouselCards.count();
  if (cardCount < 2) return;

  await firstCarouselCards.nth(1).click();
  await expect(page.locator('.unit-detail-nav__count')).toContainText('2 /');
});

// ── 3. Previous button is disabled on the first item ─────────────────────────
test('Previous button is disabled when on first item', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const cards = getCarouselCards(page);
  await cards.first().waitFor({ state: 'visible' });
  await cards.first().click();

  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
});

// ── 4. Next button navigates to the next item ────────────────────────────────
test('Next button navigates to the next item', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const firstCarouselCards = page.locator('.carousel').first().locator('.bleed-card');
  await firstCarouselCards.first().waitFor({ state: 'visible' });
  const cardCount = await firstCarouselCards.count();
  if (cardCount < 2) return;

  await firstCarouselCards.first().click();
  await expect(page.locator('.unit-detail-nav__count')).toContainText('1 /');

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.unit-detail-nav__count')).toContainText('2 /');
});

// ── 5. Previous button navigates back ────────────────────────────────────────
test('Previous button navigates back after going Next', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const firstCarouselCards = page.locator('.carousel').first().locator('.bleed-card');
  await firstCarouselCards.first().waitFor({ state: 'visible' });
  const cardCount = await firstCarouselCards.count();
  if (cardCount < 2) return;

  await firstCarouselCards.first().click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.unit-detail-nav__count')).toContainText('2 /');

  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.locator('.unit-detail-nav__count')).toContainText('1 /');
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
});

// ── 6. Keyboard arrow navigation ─────────────────────────────────────────────
test('keyboard ArrowRight and ArrowLeft navigate between items', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const firstCarouselCards = page.locator('.carousel').first().locator('.bleed-card');
  await firstCarouselCards.first().waitFor({ state: 'visible' });
  const cardCount = await firstCarouselCards.count();
  if (cardCount < 2) return;

  await firstCarouselCards.first().click();
  await expect(page.locator('.unit-detail-nav__count')).toContainText('1 /');

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.unit-detail-nav__count')).toContainText('2 /');

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.unit-detail-nav__count')).toContainText('1 /');
});

// ── 7. Escape closes the detail ───────────────────────────────────────────────
test('Escape key closes the unit detail', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const cards = getCarouselCards(page);
  await cards.first().waitFor({ state: 'visible' });
  await cards.first().click();

  await expect(page.locator('.units-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.units-panel')).not.toBeVisible();
});

// ── 8. Clicking backdrop closes the detail ───────────────────────────────────
test('clicking the backdrop closes the unit detail', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const cards = getCarouselCards(page);
  await cards.first().waitFor({ state: 'visible' });
  await cards.first().click();

  await expect(page.locator('.units-panel')).toBeVisible();
  await page.locator('.units-overlay').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('.units-panel')).not.toBeVisible();
});

// ── 9. "Recent" carousel is always the first carousel ────────────────────────
test('"Recent" carousel appears first on the landing page', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 4);
  await page.reload();

  await page.locator('.carousel').first().waitFor({ state: 'visible' });
  const firstTitle = await page.locator('.carousel__title').first().textContent();
  expect(firstTitle?.trim().toUpperCase()).toBe('RECENT');
});

// ── 10. "Recent" carousel shows the newest unit first ────────────────────────
test('"Recent" carousel shows newest unit as first card', async ({ page }) => {
  const base = Date.now();

  await page.goto('/');
  await seedUnit(page, {
    uid: 'old-unit',
    type: 'snippet',
    content: 'Old unit content',
    createdAt: base,
  });
  await seedUnit(page, {
    uid: 'new-unit',
    type: 'snippet',
    content: 'New unit content',
    createdAt: base + 10000,
  });
  await page.reload();

  const recentCarousel = page.locator('.carousel').filter({ hasText: /recent/i });
  await recentCarousel.waitFor({ state: 'visible' });
  const firstCard = recentCarousel.locator('.bleed-card').first();
  await expect(firstCard).toContainText('New unit content');
});
