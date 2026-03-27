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
| `createdAt` | `Date.now()` at insert |
| `updatedAt` | `Date.now()` at last edit (only present after an edit) |

**Created — `addUnit()`** — stamps `uid` + `createdAt`, returns `{ id, uid }`:
- UX: AddUnitModal "Save" button (`AddUnitModal.jsx:149`)
- UX: ForageModal saving an AI response as a new unit (`ForageModal.jsx:134`)
- UX: `mergeUnits()` for P2P sync and file import (preserves original `createdAt` rather than stamping now)

**Read — `getAllUnits()`** — returns all units in insertion order:
- Landing mount (initial load)
- UnitsOverlay mount (reverses array for newest-first display)
- `useVaultSync` before initiating a sync offer

**Updated — `updateUnit(id, changes)`** — merges changes, stamps `updatedAt`:
- UX: UnitDetail "Save" button (`UnitDetail.jsx:87`)

**Deleted — `deleteUnit(id)`**:
- UX: Delete button in UnitDetail, accessible from both Landing and UnitsOverlay
- Side effect: Landing's `handleUnitDelete` also removes the unit's `uid` from all category groups and calls `setCategorization` to persist the cleanup — empty groups are dropped

---

## Categories — lifecycle

Stored as a single JSON blob in the `settings` store under key `categorization`:
```
[{ id: string, title: string, uids: string[] }]
```

`uids` references unit `uid`s (not IDB `id`s), so the mapping survives export/import and P2P sync. The **Misc group is virtual** — never persisted, always computed fresh from units whose `uid` isn't in any stored group.

**Created / fully replaced — `setCategorization(groups)`** — always a full overwrite, single slot:
- UX: Categorize button (OneBIcon) → `runCategorize()` calls Gemini, receives groups, calls `setCategorization` (`Landing.jsx:104`)
- Auto-triggered on first load when no stored groups exist AND there are units (`Landing.jsx:138–140`)

**Read — `getCategorization()`**:
- Landing mount: stale uids (deleted units) are cleaned out before use; if anything was cleaned, `setCategorization` is called to persist the tidied version
- UnitsOverlay mount: loaded for category-filter UI

**Unit moved between categories — `handleCategoryAssign(uid, categoryId)`** in Landing:
- Moves a uid into the target group, removes it from all others, fire-and-forget `setCategorization`
- UX: Saving from AddUnitModal with a category chosen
- UX: Saving from UnitDetail with a category change
- UX: Saving a Forage AI response with a category

**New category added inline:**
- AddUnitModal and UnitDetail can return a `newCategory: { id, title }` object when the AI suggests a category name that doesn't already exist
- Landing creates the group with empty `uids` first, then assigns the unit into it — results in one `setCategorization` call

**Cleaned on unit delete:**
- `handleUnitDelete` removes the deleted uid from all groups, drops now-empty groups, and calls `setCategorization`

---

## Settings — what else is persisted

All in the `settings` store as `{ key, value }` rows:

| Key | Value | UX trigger |
|-----|-------|------------|
| `gemini_key` | API key string | Settings modal — "Save key" / "Remove key" buttons |
| `categorization` | `[{ id, title, uids }]` | See above |

`getSetting('gemini_key')` is called before every AI operation (categorize, suggest, forage, note AI). If absent, the operation fails with a toast directing the user to Settings.

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

- **Export** (Settings → "Export"): triggers a browser file download of the full JSON
- **Import** (Settings → "Import"): file picker → preview screen shows new-vs-already-exist count → "Import N" calls `mergeUnits()` which deduplicates by `uid` and preserves original `createdAt`. Categories are **not** exported or imported separately — they live in `settings` as part of the dump but are not re-applied automatically

---

## P2P sync

`useVaultSync` (Connect page) runs a 3-message diffing protocol over PeerJS DataConnections:

1. **Initiator → Responder** `offer`: sends all local `uid`s
2. **Responder → Initiator** `transfer`: sends units the initiator lacks, plus a `want` list of uids the responder needs
3. **Initiator → Responder** `transfer`: sends back the wanted units

All merges use `mergeUnits()` — deduplicates by `uid`, strips the peer's local `id` so IDB assigns a new local one, preserves original `createdAt`. **Categories are not synced** — only raw units cross the wire.
