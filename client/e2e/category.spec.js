const { test, expect } = require('@playwright/test');
const { seedUnit, seedCategorization, getCategorization } = require('./helpers');

const GROUPS = [
  { id: 'work',     title: 'Work',     uids: [] },
  { id: 'personal', title: 'Personal', uids: [] },
];

// ── 1. Category select hidden when no stored groups ───────────────────────────
test('category select not shown when no stored groups', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByLabel('Category')).not.toBeVisible();
});

// ── 2. Category select shown when stored groups exist ─────────────────────────
test('category select shown in AddUnit modal when stored groups exist', async ({ page }) => {
  await page.goto('/');
  await seedCategorization(page, GROUPS);
  await page.reload();

  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByLabel('Category')).toBeVisible();
  await expect(page.getByLabel('Category').locator('option[value="work"]')).toHaveText('Work');
  await expect(page.getByLabel('Category').locator('option[value="personal"]')).toHaveText('Personal');
});

// ── 3. Assigning a category on create updates stored groups ───────────────────
test('adding a unit with a category updates stored categorization', async ({ page }) => {
  await page.goto('/');
  await seedCategorization(page, GROUPS);
  await page.reload();

  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('.add-unit__textarea').fill('test snippet');
  await page.getByLabel('Category').selectOption('work');
  await page.locator('.add-unit__save-btn').click();

  // Wait for modal to close
  await expect(page.locator('.add-unit-modal')).not.toBeVisible();

  const saved = await getCategorization(page);
  const workGroup = saved.find((g) => g.id === 'work');
  expect(workGroup.uids.length).toBe(1);
});

// ── 4. Category select shown in UnitDetail when stored groups exist ───────────
test('category select shown in UnitDetail when stored groups exist', async ({ page }) => {
  await page.goto('/');
  await seedUnit(page, {
    uid: 'cat-test-uid',
    type: 'snippet',
    content: 'category test',
    createdAt: Date.now(),
  });
  await seedCategorization(page, GROUPS);
  await page.reload();

  const card = page.locator('.bleed-card').first();
  await card.waitFor({ state: 'visible' });
  await card.click();

  await expect(page.getByLabel('Category')).toBeVisible();
});

// ── 5. Pre-selects existing category in UnitDetail ────────────────────────────
test('UnitDetail pre-selects existing category for the unit', async ({ page }) => {
  await page.goto('/');
  await seedUnit(page, {
    uid: 'cat-uid-2',
    type: 'snippet',
    content: 'already categorized',
    createdAt: Date.now(),
  });
  await seedCategorization(page, [
    { id: 'work', title: 'Work', uids: ['cat-uid-2'] },
    { id: 'personal', title: 'Personal', uids: [] },
  ]);
  await page.reload();

  const card = page.locator('.bleed-card').first();
  await card.waitFor({ state: 'visible' });
  await card.click();

  await expect(page.getByLabel('Category')).toHaveValue('work');
});

// ── 6. Changing category in UnitDetail and saving updates stored groups ────────
test('changing category in UnitDetail updates stored categorization', async ({ page }) => {
  await page.goto('/');
  await seedUnit(page, {
    uid: 'cat-uid-3',
    type: 'snippet',
    content: 'move me',
    createdAt: Date.now(),
  });
  await seedCategorization(page, [
    { id: 'work', title: 'Work', uids: ['cat-uid-3'] },
    { id: 'personal', title: 'Personal', uids: [] },
  ]);
  await page.reload();

  const card = page.locator('.bleed-card').first();
  await card.waitFor({ state: 'visible' });
  await card.click();

  await page.getByLabel('Category').selectOption('personal');
  await page.locator('.add-unit__save-btn').click();

  // Wait for detail to close
  await expect(page.locator('.units-panel')).not.toBeVisible();

  const saved = await getCategorization(page);
  const workGroup = saved.find((g) => g.id === 'work');
  const personalGroup = saved.find((g) => g.id === 'personal');
  expect(workGroup.uids).not.toContain('cat-uid-3');
  expect(personalGroup.uids).toContain('cat-uid-3');
});
