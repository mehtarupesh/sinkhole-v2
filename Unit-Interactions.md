# Unit Interactions

An overview of the three main unit interaction components in 1Burrow.

---

## ForageModal

Ask AI a question about all units in a category.

### Props
- `category` — `{ id, title, uids }` the selected category
- `allUnits` — full unit list (filtered internally by uids)
- `onClose` — close handler
- `onSaveUnit(uid, categoryId)` — called after response is saved as a new unit

### What Gets Sent to AI

The modal has a **privacy toggle**: "Also send content to AI" (off by default).

`forage.js` always sends:
- Unit metadata: type + note/quote for every unit

When `shareContent=true`, it additionally sends:
- **Images** as inline multimodal base64 data (Gemini vision)
- **Text content** as raw text
- **Passwords are always excluded**, even with the toggle on

### AI Call

Uses **Google Gemini** (`gemini-3-flash-preview`) with streaming via `generateContentStream`. The system prompt instructs it to answer only from the provided items, be concise, and use simple markdown.

### Streaming Response

`runForage` consumes the async iterable stream, appending each `chunk.text` to state. A blinking cursor (`▋`) renders while streaming, replaced by the final text once done.

### Quick Prompts

Three one-tap chips — "Summarize", "Key points", "Action items" — immediately fire a question without typing.

### Save as Unit

After a response arrives, the user can save it back into 1Burrow as a new `snippet` unit (with the question as the quote/title). It gets its unique uuid.
It then gets added to the same category via `onSaveUnit(uid, category.id)`, then the modal auto-closes after 400ms.

### Rendering

Responses are rendered by `SimpleMarkdown`, a lightweight inline renderer that handles `**bold**`, `# h2`, `## h3`, bullet lists, and paragraphs — no external markdown library.

### UX Details

- Overlay click → close
- Unit strip renders all category units as `CarouselCard` thumbnails for visual context
- "Share with AI" toggle blinking state when content is present but toggle is off

---

## AddUnitModal

The primary way users save data into 1Burrow — opens when sharing from another app or manually adding a unit.

### Props
- `onClose` — close handler
- `onSaved(uid, categoryId, newCategory)` — called after save
- `storedGroups` — existing categories list
- `initialType`, `initialContent`, `initialFileName`, `initialMimeType` — pre-filled when receiving a share from another app

### Unit Types

Three types, selectable via icon buttons in the header:
- **snippet** — text/link
- **password** — masked text
- **image** — file upload

Switching type when content is already filled shows a **confirmation banner** ("Content will be lost") before clearing.

### Fields

**ContentField** — renders differently per type (text input, password input, or file picker). Stores `content`, `fileName`, `mimeType`.

**NoteField** — the `quote` field. Supports both text input and **voice recording**. Notes are always sent to AI regardless of the share toggle.

**CategorySelector** — chips for existing categories + a "✦ suggest category" trigger.

### AI Category Suggestion

Two paths:

**Voice path** (`transcribeFn`): A single combined LLM call via `transcribeAndSuggest` — transcribes audio AND suggests a category in one shot. This is the optimized happy path.

**Manual path** (`handleSuggest`): User taps "✦ suggest category" after typing. Calls `useSuggest.runSuggest()` with the current content/note/type and existing categories.

Both return either:
- `existing` → auto-selects a matching category chip
- `new` → `suggest.newCategory` holds a proposed new category (used at save time)
- `none` → clears category selection

The **"Share with AI" toggle** (`suggest.shareContent`) controls whether full content (images, text) is sent alongside the note when suggesting a category. Passwords show a warning if shared.

### Save Flow

1. Validates at least content or a note exists
2. Calls `addUnit()` to write to IndexedDB
3. Fires a haptic vibrate (`navigator.vibrate(40)`)
4. Resolves category: prefers `suggest.newCategory` (if AI proposed a new one), then the manually selected `categoryId`
5. Calls `onSaved(uid, categoryId, newCategory)` so the parent can update the carousel
6. Auto-closes after 500ms

### UX Details

- **iOS keyboard push-up**: Listens to `visualViewport` resize/scroll to shift the overlay up so the modal isn't hidden behind the software keyboard
- **Escape key** → closes the modal
- **Swipe right** → closes the modal (dx > 80px, more horizontal than vertical)
- Overlay click → close

---

## UnitDetail

The edit view for an existing unit — same shape as `AddUnitModal` but for updating rather than creating.

### Props
- `unit` — the existing unit object
- `onBack` — navigate back handler
- `onSaved(updated, categoryId, newCategory)` — called after save
- `onDelete(id)` — called after confirmed delete
- `storedGroups` — existing categories list

### Key Differences from AddUnitModal

Type is **locked** — displayed as a static icon, not switchable. `updateUnit()` is called instead of `addUnit()`. Navigation uses `onBack` rather than `onClose`.

### Dirty Tracking

`isDirty` compares current state against the original unit values across `content`, `quote`, `fileName`, `categoryId`, and `suggest.newCategory`. The Save button is **disabled when not dirty**, and the Cancel button visually becomes primary when there's nothing to save — a reversal of the usual button hierarchy.

### Delete Flow

Two-tap confirmation: first tap sets `confirmDelete = true` (button shows "Confirm?"), second tap calls `onDelete(unit.id)`. Clicking away (`onBlur`) resets the confirmation — prevents accidental deletes.

### Category Initialization

On mount it finds the unit's current category by scanning `storedGroups` for a group whose `uids` includes `unit.uid`, stored in a `useRef` so it doesn't re-derive on re-renders. This becomes the baseline for dirty-checking the category field.

### AI Suggest

Identical to `AddUnitModal` — same `useSuggest` hook, same two paths (voice via `transcribeAndSuggest`, manual via `handleSuggest`). `suggest.newCategory` is respected at save time.

### Save Flow

1. Calls `updateUnit(unit.id, changes)` to persist to IndexedDB
2. Fires a haptic vibrate (`navigator.vibrate(40)`)
3. Resolves category: prefers `suggest.newCategory`, then `categoryId`
4. Calls `onSaved(updated, resolvedCategoryId, newCategory)` after 500ms so the parent updates the carousel in place

### UX Details

- **Swipe right** → `onBack()`
- **Escape key** → `onBack()`
- Image units get a **download link** in the header
- Creation and last-edit timestamps shown at the bottom

---

## Comparison Table

| Feature / UX | ForageModal | AddUnitModal | UnitDetail |
|---|---|---|---|
| **Purpose** | Query units with AI | Create a new unit | Edit an existing unit |
| **DB operation** | None (read-only) | `addUnit()` | `updateUnit()` |
| **Type switching** | N/A | Yes, with confirmation | Locked (display only) |
| **ContentField** | No | Yes | Yes |
| **NoteField (voice)** | Yes (question input) | Yes (quote/context) | Yes (quote/context) |
| **CategorySelector** | No | Yes | Yes |
| **AI feature** | Gemini streaming Q&A | Category suggestion | Category suggestion |
| **AI model** | Gemini (streaming) | Gemini (via useSuggest) | Gemini (via useSuggest) |
| **Voice → AI (one-shot)** | No | Yes (`transcribeAndSuggest`) | Yes (`transcribeAndSuggest`) |
| **Share content with AI toggle** | Yes (sends to Gemini Q&A) | Yes (for category suggest) | Yes (for category suggest) |
| **Password excluded from AI** | Always | Warns if shared | Warns if shared |
| **Quick prompt chips** | Yes (Summarize, Key points, Action items) | No | No |
| **Streaming response** | Yes | No | No |
| **Save response as unit** | Yes (as snippet) | N/A | N/A |
| **Dirty tracking** | No | No | Yes |
| **Delete unit** | No | No | Yes (two-tap confirm) |
| **Download file** | No | No | Yes (images only) |
| **Timestamps shown** | No | No | Yes (created + edited) |
| **Haptic on save** | No | Yes | Yes |
| **Swipe right to close** | No | Yes | Yes |
| **Escape key to close** | No | Yes | Yes |
| **Overlay click to close** | Yes | Yes | No (full-screen view) |
| **iOS keyboard push-up** | No | Yes | No |
| **Auto-close after save** | Yes (400ms) | Yes (500ms) | No (calls onBack after 500ms) |
| **Unit strip preview** | Yes (CarouselCards) | No | No |
