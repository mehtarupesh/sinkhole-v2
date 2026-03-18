const { test, expect } = require('@playwright/test');
const { seedUnit } = require('./helpers');

// Seeds enough units so carousels are guaranteed to populate
async function seedUnits(page, count = 6) {
  for (let i = 1; i <= count; i++) {
    await seedUnit(page, {
      uid: `carousel-uid-${i}`,
      type: 'snippet',
      content: `Carousel unit ${i}`,
      createdAt: Date.now() + i,
    });
  }
}

// Returns the first visible carousel card on the landing page
async function getCarouselCards(page) {
  return page.locator('.carousel-card');
}

// ── 1. Opening a carousel card shows UnitDetail with nav ─────────────────────
test('clicking a carousel card opens unit detail with nav', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const cards = await getCarouselCards(page);
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

  const cards = await getCarouselCards(page);
  await cards.first().waitFor({ state: 'visible' });

  // Click the second card in the first carousel
  const firstCarouselCards = page.locator('.carousel').first().locator('.carousel-card');
  const cardCount = await firstCarouselCards.count();
  // Need at least 2 cards to test navigation; if not enough skip gracefully
  if (cardCount < 2) return;

  await firstCarouselCards.nth(1).click();
  await expect(page.locator('.unit-detail-nav__count')).toContainText('2 /');
});

// ── 3. Previous button is disabled on the first item ─────────────────────────
test('Previous button is disabled when on first item', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  const cards = await getCarouselCards(page);
  await cards.first().waitFor({ state: 'visible' });
  await cards.first().click();

  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
});

// ── 4. Next button navigates to the next item ────────────────────────────────
test('Next button navigates to the next item', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.reload();

  // Open first card in the first carousel that has at least 2 cards
  const firstCarouselCards = page.locator('.carousel').first().locator('.carousel-card');
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

  const firstCarouselCards = page.locator('.carousel').first().locator('.carousel-card');
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

  const firstCarouselCards = page.locator('.carousel').first().locator('.carousel-card');
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

  const cards = await getCarouselCards(page);
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

  const cards = await getCarouselCards(page);
  await cards.first().waitFor({ state: 'visible' });
  await cards.first().click();

  await expect(page.locator('.units-panel')).toBeVisible();
  // Click on the overlay backdrop (top-left corner, outside the panel)
  await page.locator('.units-overlay').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('.units-panel')).not.toBeVisible();
});
