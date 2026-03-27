# Action Panels

## SelectionBar — the shared action panel component

`SelectionBar` is a generic frosted-pill bar fixed at the bottom center. It always shows:
- **count** of selected items
- **action buttons** (passed in as `actions` array)
- **Select All / Deselect All** toggle
- **Close (X)** to exit selection mode

Selection mode is managed by `useSelection()` which tracks a `Set` of selected IDs and an `isSelecting` boolean. Long-pressing any selectable item enters selection mode via `enterWith(id)`.

---

## The four contexts and their action sets

### 1. Landing — default bottom bar (no selection)
`Landing.jsx:404–430` — always visible when nothing is selecting:
| Button | Action |
|--------|--------|
| `+` (PlusIcon) | Open AddUnit modal |
| Connect | Navigate to `/connect` |
| Search (SearchIcon) | Open UnitsOverlay |
| Categorize (OneBIcon) | Run AI categorization |
| Settings (GearIcon) | Open SettingsModal |

### 2. Landing — **card** selection (long-press a carousel card)
`Landing.jsx:358–373` — replaces the default bar when `cardSel.isSelecting`:
| Button | Action |
|--------|--------|
| Trash | Delete with export option |
| Share | Toast "coming soon" |
| Move to Category | Moves selected units to a new category |

### 3. Landing — **category** selection (long-press a category pill)
`Landing.jsx:374–402` — replaces the default bar when `catSel.isSelecting`:
| Button | Action |
|--------|--------|
| Trash | Delete with export option |
| Share | Toast "coming soon" |
| Rename | Rename selected category |
| Forage (AiChatIcon) | Opens ForageModal (validates: exactly 1 selected) |

### 4. UnitsOverlay — **unit** selection (long-press a card in the search grid)
`UnitsOverlay.jsx:103–119` — appears at the bottom of the overlay:
| Button | Action |
|--------|--------|
| Trash | Delete with export option |
| Share | Toast "coming soon" |
| Move to Category | Moves selected units to a new category |

---

## Key behavioral rules

- **Landing card vs category selection are mutually exclusive**: long-pressing a card clears `catSel`, and vice versa (`Landing.jsx:228–237`).
- **Selection bar replaces the default bottom bar** on Landing — it's an `isSelecting ? <SelectionBar> : <default actions>` conditional (`Landing.jsx:349`).
- **UnitsOverlay** renders its SelectionBar *inside* the overlay, not replacing anything in Landing.
- All destructive/sharing actions are currently **stubs** (toast only) — real logic is not wired yet.
- The Forage and Rename actions have **inline guards** inside `onClick` rather than being disabled, so they still appear but show a toast if preconditions aren't met.
