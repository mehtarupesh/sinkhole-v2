import { getAllUnits, getCategorization, setCategorization, mergeUnits } from './db';

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
    const res = await fetch('/demo.json');
    if (!res.ok) return; // no demo.json present, skip silently
    data = await res.json();
  } catch {
    return; // parse error or network, skip silently
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

  // Seed units — mergeUnits preserves original uid + timestamps from the dump
  if (units.length > 0) await mergeUnits(units);
}
