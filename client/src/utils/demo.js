import { getAllUnits, getCategorization, setCategorization, mergeUnits } from './db';
import { isAndroid, isIOS } from './device';
import { addUnit } from './db';
/**
 * Seeds demo data from /demo.json if the DB is completely empty.
 *
 * The demo.json format is the same as ucDump() output:
 *   { categories: [...], units: [...] }
 *
 * To iterate on demo content:
 *   1. Use the app to create the content you want.
 *   2. Settings → UC Dump → save file as client/public/demo.json
 *   3. Settings → Clear DB → app reloads with fresh demo data.
 */
export async function loadDemoIfFresh() {
  const existing = await getAllUnits();
  if (existing.length > 0) return; // not a fresh install, skip

  let data;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}demo.json`);
    if (!res.ok) return; // no demo.json present, skip silently
    data = await res.json();
  } catch (e) {
    console.error('Error loading demo data', e);
    throw e;
  }
  const { categories = [], units = [] } = data;
  if (categories.length === 0 && units.length === 0) return;

  // Seed categories — merge into whatever ensureTrashCategory already created
  if (categories.length > 0) {
    const stored = (await getCategorization()) ?? [];
    const storedIds = new Set(stored.map((g) => g.id));
    const fresh = categories.filter((c) => c.id && !storedIds.has(c.id));
    if (fresh.length > 0) await setCategorization([...stored, ...fresh]);
  }

  // if isAndroid - create new item with snippet type Install step "Settings > Install app"
  if (isAndroid()) {
    await addUnit({
      content: 'Settings > Install app',
      quote: 'Android users:Install the app on your device',
      categoryId: '1burrow-setup',
      type: 'snippet',
    });
  } else if (isIOS()) {
    await addUnit({
      content: 'Share > ..more > Add to Home Screen',
      quote: 'IOS users: Add the app to your home screen',
      categoryId: '1burrow-setup',
      type: 'snippet',
    });
  } else {
    await addUnit({
      content: 'Use Safari / Chrome to access the app',
      quote: 'MAC / PC users',
      categoryId: '1burrow-setup',
      type: 'snippet',
    });
  }

  // if isIOS - create new item with Install step "Share > ..more > Add to Home Screen"

  // Seed units — mergeUnits preserves original uid + timestamps from the dump
  if (units.length > 0) await mergeUnits(units);
}
