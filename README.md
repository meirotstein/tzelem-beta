# צל״ם פלוגתי

אפליקציית RTL מותאמת למובייל לניהול ציוד לחימה פלוגתי באמצעות Google Sheets.

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

An editor opening a truly empty spreadsheet can explicitly choose **הכנת הגיליון לצל״ם פלוגתי**. The app creates the required `חיילים`, `צלם`, `שיוכים`, and `הגדרות` tabs.

A non-empty incompatible spreadsheet is never changed automatically. The app lists its missing tabs or incorrect headers instead.
