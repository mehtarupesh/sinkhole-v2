const { test, expect } = require('@playwright/test');
const { seedUnit } = require('./helpers');

const UNITS_DB       = 'sinkhole-db';
const SETTINGS_STORE = 'settings';

/** Seeds a Gemini API key into the settings store. */
async function seedGeminiKey(page, key) {
  await page.evaluate(({ dbName, store, key }) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 2);
      req.onupgradeneeded = ({ target: { result: db } }) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'key' });
        }
      };
      req.onsuccess = ({ target: { result: db } }) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put({ key: 'gemini_key', value: key });
        tx.oncomplete = () => resolve();
        tx.onerror = ({ target: { error } }) => reject(error);
      };
      req.onerror = ({ target: { error } }) => reject(error);
    });
  }, { dbName: UNITS_DB, store: SETTINGS_STORE, key });
}

async function seedUnits(page, count) {
  const base = Date.now();
  for (let i = 1; i <= count; i++) {
    await seedUnit(page, {
      uid: `sim-uid-${i}`,
      type: 'snippet',
      content: `Sim unit ${i}`,
      createdAt: base + i * 1000,
    });
  }
}

/** Returns the count input inside the stepper. */
function countInput(page) {
  return page.getByLabel('Entry count');
}

// ── 1. Page loads and shows the stepper ──────────────────────────────────────
test('simulator page loads with a stepper', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 3);
  await page.goto('/simulate');

  await expect(page.locator('.sim-stepper')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Categorize' })).toBeVisible();
});

// ── 2. Stepper count starts at total number of units ─────────────────────────
test('stepper starts at the total unit count', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 4);
  await page.goto('/simulate');

  await expect(countInput(page)).toHaveValue('4');
  await expect(page.locator('.sim-stepper__total')).toContainText('4');
});

// ── 3. Decrement button reduces the count ────────────────────────────────────
test('decrement button reduces the entry count', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 4);
  await page.goto('/simulate');

  await page.getByRole('button', { name: 'One fewer entry' }).click();
  await expect(countInput(page)).toHaveValue('3');
});

// ── 4. Decrement is disabled at count = 1 ────────────────────────────────────
test('decrement button is disabled when count is 1', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 1);
  await page.goto('/simulate');

  await expect(page.getByRole('button', { name: 'One fewer entry' })).toBeDisabled();
});

// ── 5. Increment button increases the count ──────────────────────────────────
test('increment button increases the entry count', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 4);
  await page.goto('/simulate');

  await page.getByRole('button', { name: 'One fewer entry' }).click();
  await expect(countInput(page)).toHaveValue('3');

  await page.getByRole('button', { name: 'One more entry' }).click();
  await expect(countInput(page)).toHaveValue('4');
});

// ── 6. Increment is disabled at the maximum count ────────────────────────────
test('increment button is disabled when count equals total', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 3);
  await page.goto('/simulate');

  await expect(page.getByRole('button', { name: 'One more entry' })).toBeDisabled();
});

// ── 7. User can type a count directly and commit with Enter ──────────────────
test('typing a number and pressing Enter sets the count', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.goto('/simulate');

  const input = countInput(page);
  await input.click();
  await input.fill('3');
  await input.press('Enter');

  await expect(input).toHaveValue('3');
});

// ── 8. Typing a number and blurring commits the count ────────────────────────
test('typing a number and blurring commits the count', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 6);
  await page.goto('/simulate');

  const input = countInput(page);
  await input.click();
  await input.fill('2');
  await input.press('Tab'); // trigger blur

  await expect(input).toHaveValue('2');
});

// ── 9. Out-of-range values are clamped ───────────────────────────────────────
test('value above max is clamped to max on commit', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 4);
  await page.goto('/simulate');

  const input = countInput(page);
  await input.click();
  await input.fill('999');
  await input.press('Enter');

  await expect(input).toHaveValue('4');
});

test('value below min is clamped to min on commit', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 4);
  await page.goto('/simulate');

  const input = countInput(page);
  await input.click();
  await input.fill('0');
  await input.press('Enter');

  await expect(input).toHaveValue('1');
});

// ── 10. Escape reverts an in-progress edit ───────────────────────────────────
test('pressing Escape reverts the input to the current count', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 4);
  await page.goto('/simulate');

  const input = countInput(page);
  await input.click();
  await input.fill('2');
  await input.press('Escape');

  await expect(input).toHaveValue('4'); // reverted to original
});

// ── 11. Changing the count clears previous carousels ─────────────────────────
test('changing the stepper clears previously rendered carousels', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 3);
  await page.goto('/simulate');

  await expect(page.locator('.carousel')).toHaveCount(0);
});

// ── 12. No API key shows a descriptive error ──────────────────────────────────
test('clicking Categorize without a Gemini key shows an error', async ({ page }) => {
  await page.goto('/');
  await seedUnits(page, 2);
  await page.goto('/simulate');

  await page.getByRole('button', { name: 'Categorize' }).click();

  await expect(page.locator('.sim-error')).toBeVisible();
  await expect(page.locator('.sim-error')).toContainText('Settings');
});

// ── 13. Empty vault shows a helpful message ───────────────────────────────────
test('simulator shows an empty-state message when there are no units', async ({ page }) => {
  await page.goto('/simulate');
  await expect(page.locator('.sim-empty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Categorize' })).not.toBeVisible();
});

// ── 14. Back button navigates to the landing page ────────────────────────────
test('back button returns to the landing page', async ({ page }) => {
  await page.goto('/simulate');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL('/');
});
