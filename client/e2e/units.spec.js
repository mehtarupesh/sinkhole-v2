const { test, expect } = require('@playwright/test');
const { seedUnit, seedPendingShare, openUnitsList } = require('./helpers');

// ── 1. Add snippet ──────────────────────────────────────────────────────────
test('add snippet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('.add-unit__textarea').fill('Hello world');
  await page.locator('.add-unit__save-btn').click();

  await openUnitsList(page);
  await expect(page.locator('.unit-card__text').first()).toContainText('Hello world');
});

// ── 2. Edit snippet ─────────────────────────────────────────────────────────
test('edit snippet', async ({ page }) => {
  await page.goto('/');
  await seedUnit(page, {
    uid: 'edit-uid-1',
    type: 'snippet',
    content: 'Original text',
    createdAt: new Date().toISOString(),
  });

  await openUnitsList(page);
  await page.locator('.unit-card').first().click();
  await page.locator('.add-unit__textarea').clear();
  await page.locator('.add-unit__textarea').fill('Updated text');
  await page.locator('.add-unit__save-btn').click();

  await expect(page.locator('.unit-card__text').first()).toContainText('Updated text');
});

// ── 3. Delete unit ──────────────────────────────────────────────────────────
test('delete unit', async ({ page }) => {
  await page.goto('/');
  await seedUnit(page, {
    uid: 'delete-uid-1',
    type: 'snippet',
    content: 'To be deleted',
    createdAt: new Date().toISOString(),
  });

  await openUnitsList(page);
  await page.locator('.unit-card').first().click();
  // Two clicks: first shows confirm, second deletes
  await page.locator('.unit-detail__delete').click();
  await page.locator('.unit-detail__delete').click();

  await expect(page.locator('.units-empty')).toBeVisible();
});

// ── 4. Add password ─────────────────────────────────────────────────────────
test('add password', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('.add-unit__type-btn', { hasText: 'password' }).click();
  await page.locator('input[type="password"]').fill('secret123');
  await page.locator('.add-unit__save-btn').click();

  await openUnitsList(page);
  // Password unit shows dots (•••)
  await expect(page.locator('.unit-card__text--muted').first()).toBeVisible();
});

// ── 5. Pending share opens add modal pre-populated ──────────────────────────
test('pending share opens add modal pre-populated', async ({ page }) => {
  await page.goto('/');
  await seedPendingShare(page, { type: 'snippet', content: 'Shared content' });
  await page.goto('/?pendingShare=1');
  await expect(page.locator('.add-unit__textarea')).toHaveValue('Shared content');
});
