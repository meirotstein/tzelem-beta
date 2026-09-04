# מת״ש — ניהול ציוד פלוגתי

אפליקציית RTL מותאמת למובייל לניהול צל״מ וציוד כמותי באמצעות Google Sheets.

## Local development

```sh
npm install
npm run dev
```

The development server runs at `http://localhost:3000`. Open the app with a spreadsheet ID:

```text
http://localhost:3000/?spid=GOOGLE_SPREADSHEET_ID
```

## Checks

```sh
npm test
npm run build
```

## Offline end-to-end tests

Playwright runs the real React UI against deterministic in-memory Google auth
and spreadsheet substitutes. It does not open Google login, read a spreadsheet,
or call Apps Script. The fake services are loaded only by Vite's `e2e` mode and
cannot be enabled with a URL parameter in a production build.

Install Playwright's pinned Chromium once on a development machine:

```sh
npx playwright install chromium
```

Run the desktop and mobile suites:

```sh
npm run test:e2e
```

For the interactive runner, visible automatic browser execution, or only the
mobile project:

```sh
npm run test:e2e:ui
npm run test:e2e:headed
npm run test:e2e:mobile
```

The current E2E fixtures cover admin, user-without-definition, platoon-limited,
`צל״מ`-only, and Drive read-only access. They verify scoped records and actions,
admin-only settings, signing draft protection, the touch-signature canvas, and
an in-memory signing save. Vitest repository tests remain responsible for the
exact Google Sheets/App Script requests and server-side mutation enforcement.

Failed E2E runs retain a screenshot, video, and Playwright trace under the
ignored `test-results` directory. GitHub Actions installs Chromium and runs the
same suite before deploying Pages.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` builds, tests, and deploys the app after pushes to `main`.

Before its first successful run, enable GitHub Pages for the repository:

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Re-run the failed workflow or trigger **Deploy to GitHub Pages** manually from the Actions tab.

If `actions/configure-pages` fails with `Get Pages site failed` or `Not Found`, the application build may still have succeeded. This error normally means the Pages source has not yet been enabled as described above.

Do not add `enablement: true` using the default `GITHUB_TOKEN`: the action requires a separate token with repository administration and Pages permissions to enable Pages automatically.

## Google configuration

The app uses client-side `gapi.auth2`, Google Sheets API v4, and Drive API v3. Override the development defaults with:

```sh
VITE_GOOGLE_API_KEY=...
VITE_GOOGLE_CLIENT_ID=...
VITE_APPS_SCRIPT_DEPLOYMENT_ID=...
```

The OAuth client must allow the local and deployed web origins.

Production writes require the standalone Apps Script mutation coordinator in
[`apps-script`](apps-script). Without `VITE_APPS_SCRIPT_DEPLOYMENT_ID`, production
writes are deliberately blocked rather than falling back to unsafe concurrent
direct writes. Local development and automated tests retain the direct Sheets
writer so the UI can be developed before a coordinator is configured.

## Spreadsheet setup

An editor opening a truly empty spreadsheet can explicitly choose **הכנת הגיליון למת״ש**. The app creates the required `חיילים`, `קטלוג`, `פריטי צל״מ`, `החזקות כמותיות`, `ערכות`, `פריטי ערכה`, `תנועות`, `חתימות`, `הרשאות`, and `הגדרות` tabs.

The catalog defines whether each type is `צל״מ` or `כמותי`. It may also define an optional characteristic name and value—for example `מידה` + `M`; both remain empty when not relevant. Quantity-managed types and individual numbered `צל״מ` items may select an optional location from the managed location list in `הגדרות`. Every catalog entry may also define an optional non-negative integer `תקן`: the actual quantity is the total stock for quantity-managed equipment and the count of active numbered items for `צל״מ`. The dashboard and inventory show shortages against this value. All quantity values use the fixed display label `יח׳`. Current assignments are materialized in `פריטי צל״מ` and `החזקות כמותיות`; `תנועות` is an append-only audit trail and is not replayed to calculate current state.

Soldier phone numbers are optional. From a soldier profile, recent equipment movements can be shared as a WhatsApp draft for the last 10 minutes, today, or a custom range. If a phone number is stored, the draft is addressed directly to it.

The `החתמות` screen provides a single-session workflow: find a soldier with fuzzy search and edit their complete signed-equipment draft. `שמירת ההחתמה` opens a required touch-signature canvas; after the soldier signs, current-state changes, movement rows, the exact approved snapshot, and normalized signature strokes are saved together in one Sheets batch. A WhatsApp receipt for exactly that session is offered only after the save succeeds.

Equipment groups are reusable quantity-only signing templates. Users with quantity access and no platoon restriction manage them from `מלאי`; platoon-scoped quantity users may use active groups. Adding a group to a signing draft adds its components as ordinary editable quantity lines and fails atomically when any component lacks stock.

Saved signatures can be viewed from the soldier profile and from grouped signing-operation cards in `תנועות`. Normal loading reads only the lightweight signature index; the snapshot and stroke JSON for a single row are fetched and validated only when `הצגת חתימה` is selected, then cached in memory.

Permissions are resolved from the signed-in Google email. The `הרשאות` tab supports admins, equipment scope (`צל״מ`, `כמותי`, or `הכל`), and an optional comma-separated platoon scope. Blank platoons mean all; an email without a row keeps full operational scope but is not an admin. The first admin must be added manually in the sheet. Only admins can open `הגדרות` and manage permissions, platoons, or locations. A non-admin with access to all platoons may create, edit, remove, reactivate, and manage stock for catalog types within their equipment scope. A user limited to named platoons may assign equipment, manage soldiers in those platoons, and create new numbered `צל״מ` items from existing types, but cannot change catalog definitions, stock, or existing item records. UI visibility and every repository write enforce the same rules.

When a schema update only requires adding a missing required tab or required trailing columns, the app lists the exact additions and offers editors an explicit **השלמת מבנה הגיליון** action. Existing data is not moved or overwritten. Reordered, renamed, or conflicting headers remain incompatible and are never changed automatically.

## Concurrent writes

Normal reads remain client-side. Operational writes are sent to the Apps Script
API executable, which briefly serializes mutations, reloads current rows, finds
records by their domain keys, merges changes to unrelated fields, validates the
projected inventory state, and submits the final state/history batch atomically.
Unrelated signings are therefore saved normally. A write is rejected only when
the same field or resource changed, a numbered item is no longer available, or
aggregate quantity stock is no longer sufficient.

The trailing `מזהה בקשה` column in `תנועות` provides idempotency for retries and
double taps. It is a technical operation key and does not replace the domain keys
`מספר אישי` and `סוג + מספר מזהה`.

Admins can activate an explicit emergency writer from `הגדרות`. The central
`write_mode` setting defaults to `coordinated` when its row is missing or blank;
only the exact value `direct` enables direct Sheets writes. Direct mode never
activates automatically after an Apps Script failure. Its toggle is deliberately
written directly to Sheets so it remains available during a coordinator outage,
is audited in `תנועות`, and displays a persistent warning to every user until an
admin explicitly restores protected writes.
