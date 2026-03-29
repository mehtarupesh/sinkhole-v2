# Storage

## Storage layer

Two separate IndexedDB databases:

**`sinkhole-db` (v3)** — main database, two object stores:
- `units` — keyed by auto-increment `id`
- `settings` — keyed by a string `key`

**`sinkhole-pending` (v1)** — transient single-slot store, written by the service worker for Share Target payloads.

---

## Units — lifecycle

**Shape of a stored unit:**
| Field | Notes |
|-------|-------|
| `id` | Auto-increment local IDB key (device-local) |
| `uid` | Stable cross-device identity — base36 timestamp + random suffix, generated at insert |
| `type` | `'snippet'` / `'password'` / `'image'` |
| `content` | Text, password string, or base64 data URL |
| `fileName`, `mimeType` | For file/image types |
| `quote` | User note/annotation |
| `categoryId` | ID of the category this unit belongs to — `null` / absent means uncategorized (Misc) |
| `createdAt` | `Date.now()` at insert |
| `updatedAt` | `Date.now()` at last edit (only present after an edit) |

**Created — `addUnit()`** — stamps `uid` + `createdAt` + `categoryId`, returns `{ id, uid }`:
- UX: AddUnitModal "Save" button (`AddUnitModal.jsx`) — resolves `categoryId` from AI suggestion or user selection before calling `addUnit`
- UX: ForageModal saving an AI response as a new unit (`ForageModal.jsx`)
- UX: `mergeUnits()` for P2P sync and file import (preserves original `createdAt` and `categoryId` from the source device)

**Read — `getAllUnits()`** — returns all units in insertion order:
- Landing mount (initial load, after migrations)
- UnitsOverlay mount (reverses array for newest-first display)
- `useVaultSync` before initiating a sync offer

**Updated — `updateUnit(id, changes)`** — merges changes, stamps `updatedAt`:
- UX: UnitDetail "Save" button — includes `categoryId` change atomically with content changes
- UX: Bulk move to category — `updateUnit({ categoryId })` per unit

**Deleted — `deleteUnit(id)`**:
- UX: Delete button in UnitDetail, accessible from both Landing and UnitsOverlay
- No category cleanup needed — category membership is derived from `unit.categoryId`, so it disappears with the unit

---

## Categories — lifecycle

Stored as a single JSON blob in the `settings` store under key `categorization`:
```
[{ id: string, title: string }]
```

Category membership is derived from units: a unit belongs to a category when `unit.categoryId === category.id`. Units with no `categoryId`, or a `categoryId` that doesn't match any stored category, appear in the virtual **Misc group** — never persisted, always computed fresh.

**Created / fully replaced — `setCategorization(groups)`** — always a full overwrite, single slot:

**Read — `getCategorization()`**:
- Landing mount: loaded after migrations complete
- UnitsOverlay mount: loaded for category-filter UI

**Unit moved between categories — `updateUnit(id, { categoryId })`**:
- One IDB write, atomic with the unit
- UX: Saving from UnitDetail with a category change
- UX: Bulk move via MoveToCategoryModal (one `updateUnit` per unit)
- Moving to Misc sets `categoryId: null`

**New category added inline:**
- AddUnitModal and UnitDetail resolve the new category id before saving the unit — `categoryId` is stamped on the unit atomically
- Landing / UnitsOverlay add `{ id, title }` to stored groups and call `setCategorization` (one settings write)

**Category renamed:**
- `setCategorization` with updated title — no unit writes needed

**Category deleted:**
- Units in the deleted category are also deleted (`deleteUnit` per unit)
- Category entry removed from `setCategorization`

---

## Settings — what else is persisted

All in the `settings` store as `{ key, value }` rows:

| Key | Value | UX trigger |
|-----|-------|------------|
| `gemini_key` | API key string | Settings modal — "Save key" / "Remove key" buttons |
| `categorization` | `[{ id, title }]` | See above |
| `data_migration_version` | integer | Written by migration runner after each completed migration |

`getSetting('gemini_key')` is called before every AI operation (categorize, suggest, forage, note AI). If absent, the operation fails with a toast directing the user to Settings.

---

## Data migrations

Migrations run once on app load (before units/categories are read) via `runMigrations()` in `migrations.js`.

The runner reads `data_migration_version` from settings (defaults to -1 if absent) and runs all pending migrations in order, saving the version after each. Safe to interrupt — a crash resumes from the last completed step.

**Migration 0** — `migration_0_categoriesToUnitField`:
Converts from old schema (`categorization` stored as `[{ id, title, uids[] }]`) to new schema (`unit.categoryId`). Stamps `categoryId` onto each unit based on the old uid arrays, then strips `uids` from the stored categories.

---

## Pending share — transient persistence

`sinkhole-pending` IDB (separate database, one fixed key `current`):

- **Written** by the **service worker** when the user invokes the PWA Share Target from another app (e.g. sharing a URL from Safari)
- **Read + cleared** on next app load when `?pendingShare=1` is in the URL — Landing reads the payload (`readPendingShare`), clears it (`clearPendingShare`), and pre-populates AddUnitModal with the shared content

---

## Export / Import

`dumpDB()` serialises the entire `units` store + all `settings` as:
```json
{ "version": 3, "exportedAt": <timestamp>, "units": [...], "settings": [...] }
```

- **Export** (Settings → "Export"): triggers a browser file download of the full JSON. Units include `categoryId`; settings include `categorization` as `[{ id, title }]`.
- **Import** (Settings → "Import"): file picker → preview screen shows new-vs-already-exist count → "Import N" calls `mergeCategorization()` first (returns `idRemap`), then `mergeUnits(newUnits, idRemap)` — new units inserted, existing units updated if the file version is newer (last-write-wins).

---

## P2P sync

`useVaultSync` (Connect page) runs a 3-message diffing protocol over PeerJS DataConnections:

1. **Initiator → Responder** `offer`: `{ units: [{ uid, ts }] }` — sends uid + effective timestamp (`updatedAt ?? createdAt`) for every local unit
2. **Responder → Initiator** `transfer`: `{ units, want, categorization }` — sends units the initiator is missing or has a stale version of; `want` lists uids where the initiator's version is newer
3. **Initiator → Responder** `transfer`: `{ units, categorization }` — sends back the wanted units; no further reply

**Diff logic (responder):**
- `toSend` = local units the peer doesn't have OR where local `ts` > peer `ts`
- `want` = peer units we don't have OR where peer `ts` > local `ts`

Both sides converge to the latest version of every unit after a single exchange.

**`mergeUnits(incoming, idRemap)`** — for each incoming unit:
- Unknown `uid` → insert (strips peer's local `id`, IDB assigns a new one)
- Known `uid` → overwrite only if `incomingTs > localTs` (last-write-wins on `updatedAt ?? createdAt ?? 0`)
- Returns `{ added, updated }`

**`mergeCategorization(importedGroups)`** — merges `[{ id, title }]` metadata:
- Match by title (case-insensitive) — title is the cross-device identity; id is a local FK
- Same title, different id → remap peer's id to local id (returned as `idRemap`)
- Unknown title → add as new category
- `idRemap` is passed to `mergeUnits` so incoming units land under the correct local `categoryId`

Units carry `categoryId` across the wire. Both devices converge to the same units, same category titles, and correct category assignments after a sync.
