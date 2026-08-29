# Tzelem Beta — Project Instructions

## Product purpose

Tzelem Beta is a Hebrew, RTL, mobile-first web app for managing company combat equipment (צל״ם). Google Sheets is the system of record. The primary users are company personnel working mainly from mobile phones.

The product name shown in the UI is **צל״ם פלוגתי**.

## Reference implementation

- Reuse the modern React/Vite application shell, visual language, colors, and interaction patterns from `/Users/meirrotstein/code/shavzak-beta/app`.
- Reuse the Shavzak logo asset alongside the Tzelem product title.
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
- Equipment key: the pair `סוג` + `מספר צ` (both mandatory and unique as a pair).

Required tabs and columns:

### `חיילים`

1. `שם`
2. `מספר אישי`
3. `מחלקה`
4. `פעיל`

### `צלם`

1. `סוג`
2. `מספר צ`
3. `סטטוס`
4. `מספר אישי משויך`
5. `הערה`
6. `פעיל`

### `שיוכים`

1. `חותמת זמן`
2. `פעולה`
3. `סוג`
4. `מספר צ`
5. `מספר אישי קודם`
6. `מספר אישי חדש`
7. `מבצע הפעולה`
8. `הערה`

### `הגדרות`

Contains managed lists for equipment types and platoons. Users select from these lists and can add new values through the app rather than entering arbitrary values in normal edit forms.

Keep the schema definition centralized in code. Reads and writes must target headers by the validated contract rather than relying on unexplained numeric offsets throughout the UI.

## Spreadsheet initialization and compatibility

- Inspect spreadsheet metadata and relevant bounded ranges before any write.
- Offer **הכנת הגיליון לצל״ם פלוגתי** only when the spreadsheet is truly empty and the signed-in user can edit it.
- Setup must require explicit user confirmation before creating the four tabs and their headers.
- Never treat a non-empty spreadsheet as empty merely because expected tabs are missing.
- If a non-empty spreadsheet is incompatible, do not create, rename, delete, or rewrite tabs. Show a distinct incompatibility message, for example: **מבנה הגיליון אינו תואם לצל״ם פלוגתי. לא בוצעו שינויים.**
- The incompatibility view should identify missing tabs or incorrect headers so the user can fix the sheet deliberately.
- A reader opening an empty spreadsheet must not be offered a write action; explain that an editor must prepare it.
- Do not implement import from the older four-column reference sheet in the first version.

## Domain rules

- One equipment item may have at most one current soldier.
- One soldier may hold multiple equipment items.
- Moving assigned equipment to another soldier is a transfer, not a second assignment.
- Soldiers and equipment are archived/reactivated, not permanently deleted.
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

The main UI shows current state, with separate history views.

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

- `שיוך ציוד`
- `הוספת חייל`
- `הוספת צל״ם`

### Soldiers

- List name, personal number, platoon, and a useful current-equipment summary.
- Add, edit, archive, reactivate, search, and filter by platoon.
- Soldier profile shows all current equipment and complete history.
- Provide WhatsApp sharing for exactly the soldiers in the current filtered result. Group the message by platoon and list each soldier's currently assigned equipment.

### Equipment

- List type, equipment number, status, and current holder.
- Add, edit, archive, reactivate, assign, return, transfer, and change status.
- Equipment profile shows its current holder and complete assignment/status history.
- Provide WhatsApp sharing for exactly the equipment in the current filtered result. Group the message by equipment type and show each item's current holder and platoon when assigned.

### History

- Search and filter activity by soldier name/personal number, equipment type, equipment number, platoon where derivable, action, status, user, and date.

### Settings

- Manage equipment types and platoons.
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
- Require confirmation for consequential actions such as return, transfer, archive, lost, and disabled.
- Read-only mode must visibly explain why actions are unavailable, not merely hide all context.
- Do not show stale success after a failed Sheets write. Provide a retry path where safe.
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
