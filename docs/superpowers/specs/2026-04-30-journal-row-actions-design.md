# Journal row actions — drag/drop, context menu, copy

**Date:** 2026-04-30
**Surface:** Food Journal page (web) — `web/src/app/journal/page.tsx`. The desktop Electron app re-uses this page through the `@/app/journal/page` alias declared in `desktop/vite.config.ts`, so this work ships to both surfaces from one file.
**Tickets:** DSHKI-1 (menu), DSHKI-2 (copy button), DSHKI-3 (drag/drop)

## Goal

Make per-entry actions on the food journal faster and more discoverable on every device:

- Drag a food row from one meal section to another to **move** it (desktop pointer only).
- Right-click a row, or tap a 3-dot button on the row, to open a context menu with **Edit / Copy to ▸ / Delete**.
- Tap a copy icon on a row to duplicate the entry into another meal on the same day in two taps.

## Non-goals

- No copy-to-different-date.
- No multi-select.
- No reordering within a meal section.
- No backend or API changes — all operations use existing endpoints.

## Surface changes

Each food entry row in `MealSection` (currently the inline `entries.map(...)` block at [page.tsx:954](web/src/app/journal/page.tsx:954)) is extracted into a new `EntryRow` component. The row's right-side UI **replaces** the existing hover-only trash icon with two icons:

1. **Copy icon** (`Copy` from lucide-react) — opens `MealPickerPopover` directly.
2. **3-dot icon** (`MoreVertical`) — opens `EntryActionMenu`.

Both icons are always visible on touch devices and visible on row hover on pointer devices, matching the existing trash-icon pattern.

Tap-to-edit on the row body is preserved.

## New components (all in `page.tsx`)

### `EntryRow`
Owns a single journal entry's rendering, drag handlers, right-click handler, and the two trailing icon buttons. Props: `entry`, `mealType`, `onEdit`, `onDelete`, `onCopy(targetMeal)`, `onMove(targetMeal)`.

### `EntryActionMenu`
Floating popover, anchored under the 3-dot icon or at the cursor for right-click. Items:

- **Edit** — calls `onEdit(entry)`, which is the existing `EditEntryModal` flow.
- **Copy to ▸** — hover/tap reveals a 4-button submenu (Breakfast / Lunch / Dinner / Snack); the entry's current meal is disabled. Selection calls `onCopy(target)`.
- **Delete** (destructive red) — calls `onDelete(entry.id)` after a confirm-on-tap pattern (keep the existing delete behaviour — no extra confirm dialog).

Closes on outside click, Escape, or after an item is chosen.

### `MealPickerPopover`
4-button meal chooser, used by both the standalone copy icon and "Copy to ▸". Disables the entry's current meal. Single tap on a target = action fires + popover closes.

## Behaviour

### Copy
`onCopy(target)` calls `addJournalEntry({ date, meal_type: target, food_id, food_name_snapshot, servings, calories_snapshot, protein_snapshot })` cloning fields from the source entry. The new entry is appended to local state via `handleEntryAdded`. Socket event `journal-entry-created` re-fetches as a safety net.

### Move (drag/drop)
`EntryRow` sets `draggable={pointerCapable}` (falsy on touch). Drag start writes the entry id to `dataTransfer`. The `MealSection` entries container handles `onDragOver` / `onDrop`. Drop calls `updateJournalEntry(id, { meal_type: target })` and optimistically updates local state via `handleEntryUpdated`. On error, revert and surface a toast (or set the error banner — match existing style).

`pointerCapable` = `window.matchMedia('(hover: hover)').matches`. Re-evaluated only on mount; rotation between input modes is rare enough not to warrant listening.

### Right-click
`onContextMenu` on the row calls `preventDefault()` and opens `EntryActionMenu` at `{ clientX, clientY }`. Same menu instance as the 3-dot click, so behaviour stays consistent.

## State

`MealSection` and `JournalPage` keep the data they own today. New transient UI state (which menu is open, drag-over target, copy-popover anchor) lives in `EntryRow` and `MealSection` respectively — no global state.

## Edge cases

- **Drag onto own meal section** — dropped on origin section: no-op (don't fire update).
- **Copy to current meal** — disabled in the picker.
- **Network failure on move** — revert to original `meal_type`; show error banner.
- **Menu open while another row is right-clicked** — close the previous menu before opening the new one (single open menu invariant).
- **Mobile context menu (long-press)** — `onContextMenu` works on iOS/Android too via long-press; we keep the default behaviour, so `preventDefault` should suppress the system selection menu and surface ours instead. Verified during preview.

## Files touched

- `web/src/app/journal/page.tsx` — extract `EntryRow`, add `EntryActionMenu` + `MealPickerPopover`, wire DnD on `MealSection`.

No other files. Desktop app inherits via Vite alias.

## Verification

Browser preview run-through:

1. Hover a row on desktop → 3-dot + copy icons appear; click 3-dot → menu opens with Edit / Copy to / Delete; pick Copy to → submenu; pick a target → row appears in target section without page reload.
2. Right-click a row → same menu opens at cursor.
3. Drag a row from Breakfast onto Lunch → row moves; refresh confirms persisted.
4. Resize to mobile width → 3-dot and copy icons always visible; tap 3-dot → menu; tap Copy icon → meal picker.
5. Tap copy icon, pick Dinner → entry appears in Dinner with same servings and snapshots.
