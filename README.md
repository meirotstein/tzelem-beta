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
