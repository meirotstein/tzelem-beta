# Matash (מת״ש) — Project Instructions

## Product purpose

Matash (מת״ש) is a Hebrew, RTL, mobile-first web app for managing numbered and quantity-based company equipment. Google Sheets is the system of record. The primary users are company personnel working mainly from mobile phones.

The product name shown in the UI is **מת״ש**, with the subtitle **ניהול ציוד פלוגתי**.

## Reference implementation

- Reuse the modern React/Vite application shell, visual language, colors, and interaction patterns from `/Users/meirrotstein/code/shavzak-beta/app`.
- Reuse the Shavzak logo asset alongside the Matash product title.
- Keep this project standalone; do not modify `shavzak-beta` unless explicitly requested.
- Preserve static-hosting compatibility (including GitHub Pages and a relative Vite base).

## Technical direction

- React, TypeScript, and Vite.
- Client-only Google integration; no application backend and no server-held Google credentials.
- Use the legacy Google login method from Shavzak (`gapi.auth2`) as explicitly requested.
- Access Google Sheets and Drive APIs from the signed-in browser session.
- Accept the spreadsheet ID through `?spid=...` and persist it in local storage. Do not show a normal sheet-switch action in the authenticated header; choosing another sheet remains available as an error-recovery action.
- Show the signed-in Google user's display name in the authenticated header.
- Determine editability from Google Drive permissions: writers/owners may edit, while readers receive a read-only UI.
- Keep spreadsheet access behind a typed repository/service layer. Normalize and validate sheet values before placing them in UI state.
- Render spreadsheet-provided content as text; do not inject it as HTML.

## Spreadsheet contract

Do not introduce opaque/internal IDs. Domain keys are the real operational identifiers:

- Soldier key: `מספר אישי` (mandatory and globally unique).
- Catalog key: `סוג` + optional `ערך מאפיין` (unique as a pair).
- Numbered equipment key: `סוג` + `מספר מזהה` (both mandatory and unique as a pair).

Required tabs and columns:

### `חיילים`

1. `שם`
2. `מספר אישי`
3. `מחלקה`
4. `פעיל`
5. `טלפון` (optional; used for direct WhatsApp sharing)

### `קטלוג`

1. `סוג`
2. `ערך מאפיין`
3. `שם מאפיין`
4. `שיטת ניהול`
5. `מלאי כולל`
6. `הערה`
7. `פעיל`
8. `מיקום` (optional)
9. `תקן` (optional non-negative integer)

`שם מאפיין` and `ערך מאפיין` are optional. For example, use `מידה` + `M`, or `דגם` + `42`. Leave both blank for items such as personal bandages or protective glasses. Do not show the term “וריאנט” in the user interface. `שיטת ניהול` is either `צל״מ` or `כמותי`. Catalog `מיקום` is optional for quantity equipment and must come from the managed location list. Individual numbered `צל״מ` items also have an optional managed location. `תקן` is optional for both methods; compare it with total stock for quantity equipment and with the number of active numbered items for `צל״מ`. All quantity values are displayed with the fixed label `יח׳`; do not add a configurable counting-unit field.

### `פריטי צל״מ`

1. `סוג`
2. `ערך מאפיין`
3. `מספר מזהה`
4. `סטטוס`
5. `מספר אישי משויך`
6. `הערה`
7. `פעיל`
8. `מיקום` (optional; from the managed location list)

### `החזקות כמותיות`

1. `מספר אישי`
2. `סוג`
3. `ערך מאפיין`
4. `כמות`

### `ערכות`

1. `שם ערכה`
2. `הערה`
3. `פעיל`

### `פריטי ערכה`

1. `שם ערכה`
2. `סוג`
3. `ערך מאפיין`
4. `כמות`
5. `פעיל`

Equipment-group names are mandatory and unique operational keys; do not add an opaque group ID. A group contains at least one active quantity-managed catalog item, each with a positive integer quantity. Group definitions are archived/reactivated rather than deleted. Only users with quantity access and no platoon restriction may create, edit, archive, or reactivate definitions. Platoon-scoped users with quantity access may use active groups in signing drafts. Adding a group is atomic: if any component lacks stock, add none of its components and show the shortages. Once added, components behave as independent quantity draft lines.

### `תנועות`

1. `חותמת זמן`
2. `פעולה`
3. `שיטת ניהול`
4. `סוג`
5. `ערך מאפיין`
6. `מספר מזהה`
7. `כמות`
8. `מספר אישי קודם`
9. `מספר אישי חדש`
10. `מבצע הפעולה`
11. `הערה`

### `חתימות`

1. `חותמת זמן`
2. `מספר אישי`
3. `שם חייל`
4. `מבצע הפעולה`
5. `פרטי ההחתמה`
6. `נתוני חתימה`
7. `גרסת פורמט`

Each signing session has one signature row. `פרטי ההחתמה` is a JSON snapshot of exactly the changes approved by the soldier, and `נתוני חתימה` contains normalized signature strokes as validated JSON. Relate the signature to its movement rows through the shared timestamp and soldier personal number; do not add an opaque session ID. Render signature data only through the canvas implementation after validation, never as injected HTML. Normal app loading must read only the signature index columns (`A:D` and `G`); fetch `E:F` for one validated row only after the user requests to view that signature, and cache the result in memory.

### `הרשאות`

1. `אימייל`
2. `מנהל`
3. `היקף ציוד`
4. `מחלקות`

`אימייל` is the signed-in Google email and must be unique case-insensitively. `היקף ציוד` is one of `צל״מ`, `כמותי`, or `הכל`. `מחלקות` is a comma-separated list; blank means all platoons. A user without a permissions row receives all platoons and both equipment methods but is not an admin. Admins bypass operational scopes. The first admin must be inserted manually in the sheet.

### `הגדרות`

Contains managed platoon and equipment-location lists plus `schema_version` (currently `8`). Equipment types, optional characteristics, standards, and equipment groups are managed from `מלאי`.

Keep the schema definition centralized in code. Reads and writes must target headers by the validated contract rather than relying on unexplained numeric offsets throughout the UI.

## Spreadsheet initialization and compatibility

- Inspect spreadsheet metadata and relevant bounded ranges before any write.
- Offer **הכנת הגיליון למת״ש** only when the spreadsheet is truly empty and the signed-in user can edit it.
- Setup must require explicit user confirmation before creating the ten tabs and their headers.
- Never treat a non-empty spreadsheet as empty merely because expected tabs are missing.
- Treat a structural difference as safely upgradeable only when it can be resolved by adding a required missing tab or adding required trailing columns whose existing headers still match in order. Show the exact additions and offer editors an explicit **השלמת מבנה הגיליון** action. Apply all additions and the schema-version update in one Sheets batch; never delete, move, rename, or overwrite existing data.
- If a non-empty spreadsheet has reordered, renamed, conflicting, or otherwise incompatible headers, do not create, migrate, rename, delete, or rewrite tabs. Show a distinct incompatibility message, for example: **מבנה הגיליון אינו תואם למת״ש. לא בוצעו שינויים.**
- The incompatibility or additive-update view should identify the exact missing tabs, columns, or incorrect headers so the user can act deliberately.
- A reader opening an empty spreadsheet must not be offered a write action; explain that an editor must prepare it.
- Do not implement migration or import from older schemas.

## Domain rules

### Authorization

- Restrict both UI visibility and repository writes by the signed-in email's resolved permission.
- Platoon-scoped users may see and operate only on soldiers, assignments, movements, and signatures belonging to their permitted platoons. Unassigned equipment remains visible when its management method is permitted so it can be issued.
- Equipment scope is `צל״מ`, `כמותי`, or `הכל`; hide and block the other management method.
- Only admins may access settings and manage permissions or platoons.
- A permitted non-admin with all-platoons access may create, edit, archive/reactivate, and manage stock for catalog types within their equipment scope.
- A non-admin limited to named platoons may assign/return/transfer permitted equipment, manage soldiers in those platoons, and create new numbered `צל״מ` items from an existing catalog type. They may not create or edit catalog types, adjust stock, edit existing numbered items, or archive/reactivate catalog or numbered records.
- A permitted non-admin with `צל״מ` access may add, edit, remove/reactivate, assign, return, transfer, and change status for numbered `צל״מ` within scope.
- Re-resolve and enforce permissions immediately before every write. UI hiding is not sufficient authorization.
- Never expose permission-management history to non-admin users.

- One equipment item may have at most one current soldier.
- One soldier may hold multiple equipment items.
- Quantity equipment is held as a positive integer quantity per soldier and catalog key; zero is allowed only as the materialized result of a return.
- Quantity stock has a non-negative integer total, and total active holdings must never exceed it.
- Quantity operations include issue, return, transfer, stock addition, and stock reduction. A stock reduction cannot make total stock lower than active holdings.
- Moving assigned equipment to another soldier is a transfer, not a second assignment.
- Soldiers and equipment are archived/reactivated, not permanently deleted.
- User-facing actions use `הסרה`/`הסר` rather than the term `ארכוב`. In this app, removal means setting the record inactive while preserving its data and history for later reactivation.
- Archived soldiers cannot receive equipment.
- Archived equipment cannot be assigned.
- Equipment with an active assignment cannot be archived until it is returned or transferred.
- Supported equipment statuses are:
  - `זמין`
  - `משויך`
  - `תקול`
  - `אבוד`
  - `בתיקון`
  - `מושבת`
- Assignment state and status must remain consistent. An item with a current holder is `משויך`; returning it normally makes it `זמין` unless the same operation explicitly records another valid condition.
- An operational note is optional for normal assignment, return, and transfer. It is mandatory when marking equipment `אבוד`, `תקול`, or `מושבת`.
- Validate uniqueness and all invariants both in the UI and immediately before writing.

## Audit history

The main UI shows current state, with separate history views. Current state is read directly from `פריטי צל״מ` and `החזקות כמותיות`; never replay `תנועות` to calculate it.

Append a history entry for every operational change, including:

- assignment;
- return;
- transfer;
- equipment status change;
- soldier or equipment edit;
- archive or reactivation.

Each entry records the timestamp, action, equipment key where relevant, previous and new soldier personal numbers where relevant, signed-in Google user email, and optional/required note. History is append-only through the app and should not be silently rewritten when current records are edited.

For operations that update current state and append history, minimize partial writes by using a single Sheets batch update where practical. Surface failures clearly and do not leave optimistic UI state presented as successfully saved.

## MVP screens and navigation

### Signings

- Provide a dedicated `החתמות` section with fuzzy soldier search across name, personal number, phone, and platoon.
- After selecting a soldier, show the complete current signed-equipment state: every assigned `צל״מ` item and every positive quantity holding.
- Treat edits as a local draft. Allow removing `צל״מ`, changing or zeroing quantities, and adding available `צל״מ` or quantity equipment.
- Keep a quantity item visible while its numeric input is temporarily empty, show inline validation, and block saving until a valid whole quantity is entered.
- Track whether the signing draft differs from the soldier's current holdings. Before navigating to another screen or replacing the selected soldier, use the app confirmation modal to warn that unsaved changes will be lost.
- Confirm before removing any numbered or quantity item from the signing draft, even though the draft has not yet been saved.
- Label equipment-addition actions `הוספה להחתמה` so they are not confused with creating inventory records.
- Quantity-to-add inputs must allow temporarily empty text while editing and validate a positive integer only when applying the addition.
- Title the draft-addition section `הוספת ציוד להחתמה`. Below it, expose the permitted `סוג ציוד חדש` and `פריט צל״מ חדש` inventory actions using the same modals as the inventory screen. Saving those modals must refresh their option lists without resetting the in-progress signing draft.
- When a new numbered `צל״מ` item is created from the signing screen, add the newly created available item directly to the selected soldier's signing draft after the background refresh succeeds.
- Pressing `שמירת ההחתמה` opens a required finger-signature canvas and does not write yet. Allow clearing or cancelling the signature.
- Save only after a meaningful signature is present. Save the complete draft as one atomic Sheets batch containing all current-state updates, matching movement rows, the exact operation snapshot, and the normalized signature strokes. Do not write each edit as it is made.
- After a successful save, show a WhatsApp confirmation containing exactly the changes in that signing session and the action performer. Use the soldier's phone when present; otherwise open the contact picker.
- Show the soldier's signing sessions in their profile. Group signed movement rows into signing-operation cards in `תנועות`. Both locations open the same lazy-loaded signature modal with metadata, approved changes, and the rendered signature.

### Dashboard (home)

Show:

- total active equipment;
- assigned equipment;
- available equipment;
- faulty/in-repair equipment;
- lost equipment;
- active soldiers without any assigned equipment;
- recent activity.

Prominent actions:

- `החתמת ציוד`
- `הוספת חייל`
- `הוספת פריט צל״מ`

### Soldiers

- List name, personal number, platoon, and a useful current-equipment summary.
- Add, edit, archive, reactivate, search, and filter by platoon.
- Label the soldier name field `שם מלא`. Personal numbers must contain ASCII digits only; keep them as text so leading zeroes are preserved.
- Soldier profile shows all current equipment and complete history.
- Soldier profile provides a `פתיחת החתמה` action that navigates directly to `החתמות` with that soldier already selected.
- Soldier profile allows sharing equipment movements for a selected time range. Default to the last 10 minutes, with quick access to today and a custom range. When a phone is present, address the WhatsApp draft directly to it; otherwise open the contact picker. Include the soldier name and action performer for every movement.
- Provide WhatsApp sharing for exactly the soldiers in the current filtered result. Group the message by platoon and list each soldier's currently assigned equipment.

### Inventory

- Show numbered items with status/current holder and quantity catalog entries with total, held, and available quantities.
- Add, edit, remove/reactivate, issue, return, and transfer both management methods; numbered items also support status changes, and quantity items support stock adjustment.
- The new numbered-item form lists active `צל״מ` catalog types only, never quantity-managed types.
- The new catalog-type form defaults to `כמותי` when that method is available to the user.
- Starting an issue from an available inventory item must open the `החתמות` workflow with that item preselected after soldier selection, including the required manual signature and WhatsApp receipt.
- Provide WhatsApp sharing for exactly the filtered numbered and quantity inventory, including current holders.

### History

- Search and filter activity by soldier name/personal number, equipment type, equipment number, platoon where derivable, action, status, user, and date.

### Settings

- The entire screen is admin-only. Manage platoons and the `הרשאות` table here. Catalog and equipment-type management belong exclusively in `מלאי`; do not duplicate catalog controls in `הגדרות`.
- Permission management supports add, edit, and removal, but must retain at least one admin. Clearly warn that removing a user's row restores the default full operational scope without admin rights.
- Do not allow removing a managed value while active records still reference it; archive or retain it instead.

## Search and filtering

Support Hebrew-friendly free-text search and explicit filters for:

- soldier name;
- personal number;
- platoon;
- equipment type;
- equipment number;
- assignment/status state.

Filtering is combinable. Clear filters must be easy to discover on mobile.

## UX requirements

- Hebrew-only user-facing copy for the MVP.
- Set document and component direction to RTL, while keeping identifiers and numbers readable.
- Design mobile-first with large touch targets, clear loading/saving/error states, and accessible form labels.
- Keep filter controls in at least two columns even on narrow phones; the primary search field may span the full row.
- Show operational success and error feedback as fixed, dismissible toast messages so it remains visible regardless of scroll position. Keep field-specific validation beside its field.
- Use the app's accessible confirmation modal for consequential actions; do not use browser `alert` or `confirm` dialogs. Removal confirmations must identify the record and explain that its data and history are retained.
- Require confirmation for consequential actions such as return, transfer, archive, lost, and disabled.
- Read-only mode must visibly explain why actions are unavailable, not merely hide all context.
- Do not show stale success after a failed Sheets write. Provide a retry path where safe.
- After normal writes, refresh spreadsheet data silently without returning to the full-page loading state. Preserve the active screen, filters, and scroll context, and show a compact saving indicator instead.
- Render WhatsApp sharing actions as icon-only buttons using the shared Shavzak WhatsApp asset, with an accessible Hebrew `aria-label` and tooltip; do not use a text share button.
- Encode the complete WhatsApp message with `encodeURIComponent` before opening the `whatsapp://send` URL.
- Never expose raw API errors, OAuth tokens, API keys, or spreadsheet contents in production logs.

## Verification expectations

Before considering a change complete:

- Run TypeScript/build checks.
- Test empty-sheet detection separately from incompatible-sheet detection.
- Test reader and writer behavior.
- Test uniqueness and assignment invariants.
- Test assignment, return, transfer, status changes, archive/reactivation, and their history records.
- Test mobile-width RTL layouts and loading, empty, error, and read-only states.
- Keep unrelated user changes intact.
