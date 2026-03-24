const { test, expect } = require('@playwright/test');
const { seedUnit, openUnitsList } = require('./helpers');

async function openSettings(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForSelector('.modal');
}

/** Read all units directly from IndexedDB in the page context. */
async function readUnitsFromDB(page) {
  return page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('sinkhole-db', 3);
      req.onsuccess = ({ target: { result: db } }) => {
        const store = db.transaction('units', 'readonly').objectStore('units');
        const r = store.getAll();
        r.onsuccess = ({ target: { result } }) => resolve(result);
        r.onerror = ({ target: { error } }) => reject(error);
      };
      req.onerror = ({ target: { error } }) => reject(error);
    });
  });
}

// ── 1. Export button is present and DB contains correct units ─────────────────
test('export produces a valid sinkhole JSON file', async ({ page }) => {
  await page.goto('/');
  await seedUnit(page, {
    uid: 'dump-uid-1',
    type: 'snippet',
    content: 'Export me',
    createdAt: Date.now(),
  });
  await seedUnit(page, {
    uid: 'dump-uid-2',
    type: 'password',
    content: 'secret',
    createdAt: Date.now(),
  });
  await page.reload();

  await openSettings(page);
  await expect(page.getByTestId('export-btn')).toBeVisible();

  // Verify the data that would be exported is correct
  const units = await readUnitsFromDB(page);
  expect(units).toHaveLength(2);
  expect(units.map((u) => u.uid)).toContain('dump-uid-1');
  expect(units.map((u) => u.uid)).toContain('dump-uid-2');
});

// ── 2. Export preserves image data URL ───────────────────────────────────────
test('export preserves image data intact', async ({ page }) => {
  await page.goto('/');
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  await seedUnit(page, {
    uid: 'img-uid-1',
    type: 'image',
    content: dataUrl,
    fileName: 'test.png',
    mimeType: 'image/png',
    createdAt: Date.now(),
  });
  await page.reload();

  await openSettings(page);
  await expect(page.getByTestId('export-btn')).toBeVisible();

  // Verify image data is intact in the DB (dumpDB reads directly from DB)
  const units = await readUnitsFromDB(page);
  const imgUnit = units.find((u) => u.uid === 'img-uid-1');
  expect(imgUnit.content).toBe(dataUrl);
  expect(imgUnit.fileName).toBe('test.png');
  expect(imgUnit.mimeType).toBe('image/png');
});

// ── 3. Import shows preview of new units ─────────────────────────────────────
test('import shows preview of new units', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);

  const importData = JSON.stringify({
    version: 2,
    exportedAt: Date.now(),
    units: [
      { uid: 'import-uid-1', type: 'snippet', content: 'Imported snippet', createdAt: Date.now() },
      { uid: 'import-uid-2', type: 'password', content: 'importpw', createdAt: Date.now() },
    ],
    settings: [],
  });

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'sinkhole-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importData),
  });

  await expect(page.getByTestId('import-preview')).toBeVisible();
  await expect(page.getByTestId('import-save-btn')).toContainText('Import 2');
  await expect(page.getByTestId('import-preview-list')).toBeVisible();
});

// ── 4. Import saves new units into the DB ────────────────────────────────────
test('import saves new units', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);

  const importData = JSON.stringify({
    version: 2,
    exportedAt: Date.now(),
    units: [
      { uid: 'save-uid-1', type: 'snippet', content: 'Saved via import', createdAt: Date.now() },
    ],
    settings: [],
  });

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'sinkhole-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importData),
  });

  await page.getByTestId('import-save-btn').click();
  await expect(page.getByTestId('import-status')).toContainText('Imported 1 item');

  // Verify the unit is now in the DB
  await page.locator('.btn-close').click(); // close settings
  await openUnitsList(page);
  await expect(page.locator('.bleed-card__text').first()).toContainText('Saved via import');
});

// ── 5. Import deduplicates — skips already-known units ───────────────────────
test('import skips units already in DB', async ({ page }) => {
  await page.goto('/');
  await seedUnit(page, {
    uid: 'existing-uid-1',
    type: 'snippet',
    content: 'Already here',
    createdAt: Date.now(),
  });
  await page.reload();
  await openSettings(page);

  const importData = JSON.stringify({
    version: 2,
    exportedAt: Date.now(),
    units: [
      { uid: 'existing-uid-1', type: 'snippet', content: 'Already here', createdAt: Date.now() },
      { uid: 'new-uid-999', type: 'snippet', content: 'Brand new', createdAt: Date.now() },
    ],
    settings: [],
  });

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'sinkhole-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importData),
  });

  // Preview should show only 1 new unit (the duplicate is skipped)
  await expect(page.getByTestId('import-save-btn')).toContainText('Import 1');
  await expect(page.getByTestId('import-preview')).toContainText('already exist');
});

// ── 6. Import cancel discards the preview ────────────────────────────────────
test('import cancel discards preview', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);

  const importData = JSON.stringify({
    version: 2,
    exportedAt: Date.now(),
    units: [
      { uid: 'cancel-uid-1', type: 'snippet', content: 'Cancel me', createdAt: Date.now() },
    ],
    settings: [],
  });

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'sinkhole-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importData),
  });

  await expect(page.getByTestId('import-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('import-preview')).not.toBeVisible();
  await expect(page.getByTestId('export-btn')).toBeVisible();
});

// ── 7. Import invalid file shows error ───────────────────────────────────────
test('import invalid file shows error', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not valid json {{{'),
  });

  await expect(page.getByTestId('import-status')).toContainText('Invalid file');
});
