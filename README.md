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
```

The OAuth client must allow the local and deployed web origins.

## Spreadsheet setup

An editor opening a truly empty spreadsheet can explicitly choose **הכנת הגיליון למת״ש**. The app creates the required `חיילים`, `קטלוג`, `פריטי צל״מ`, `החזקות כמותיות`, `תנועות`, `חתימות`, `הרשאות`, and `הגדרות` tabs.

The catalog defines whether each type is `צל״מ` or `כמותי`. It may also define an optional characteristic name and value—for example `מידה` + `M`; both remain empty when not relevant. Quantity-managed types and individual numbered `צל״מ` items may select an optional location from the managed location list in `הגדרות`. Every catalog entry may also define an optional non-negative integer `תקן`: the actual quantity is the total stock for quantity-managed equipment and the count of active numbered items for `צל״מ`. The dashboard and inventory show shortages against this value. All quantity values use the fixed display label `יח׳`. Current assignments are materialized in `פריטי צל״מ` and `החזקות כמותיות`; `תנועות` is an append-only audit trail and is not replayed to calculate current state.

Soldier phone numbers are optional. From a soldier profile, recent equipment movements can be shared as a WhatsApp draft for the last 10 minutes, today, or a custom range. If a phone number is stored, the draft is addressed directly to it.

The `החתמות` screen provides a single-session workflow: find a soldier with fuzzy search and edit their complete signed-equipment draft. `שמירת ההחתמה` opens a required touch-signature canvas; after the soldier signs, current-state changes, movement rows, the exact approved snapshot, and normalized signature strokes are saved together in one Sheets batch. A WhatsApp receipt for exactly that session is offered only after the save succeeds.

Saved signatures can be viewed from the soldier profile and from grouped signing-operation cards in `תנועות`. Normal loading reads only the lightweight signature index; the snapshot and stroke JSON for a single row are fetched and validated only when `הצגת חתימה` is selected, then cached in memory.

Permissions are resolved from the signed-in Google email. The `הרשאות` tab supports admins, equipment scope (`צל״מ`, `כמותי`, or `הכל`), and an optional comma-separated platoon scope. Blank platoons mean all; an email without a row keeps full operational scope but is not an admin. The first admin must be added manually in the sheet. Only admins can open `הגדרות` and manage permissions, platoons, or locations. A non-admin with access to all platoons may create, edit, remove, reactivate, and manage stock for catalog types within their equipment scope. A user limited to named platoons may assign equipment, manage soldiers in those platoons, and create new numbered `צל״מ` items from existing types, but cannot change catalog definitions, stock, or existing item records. UI visibility and every repository write enforce the same rules.

When a schema update only requires adding a missing required tab or required trailing columns, the app lists the exact additions and offers editors an explicit **השלמת מבנה הגיליון** action. Existing data is not moved or overwritten. Reordered, renamed, or conflicting headers remain incompatible and are never changed automatically.
