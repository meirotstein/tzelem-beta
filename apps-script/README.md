# מתאם שמירות מקביליות

This is one standalone Apps Script project for the entire application. Do not
copy or bind it to each managed spreadsheet.

## One-time Google setup

1. Open [script.google.com](https://script.google.com) and create a standalone
   project.
2. In **Project settings**, enable showing `appsscript.json` in the editor.
3. Replace the generated files with `Code.gs` and `appsscript.json` from this
   directory.
4. Set the Apps Script project's Google Cloud project number to the same
   standard Cloud project that owns `VITE_GOOGLE_CLIENT_ID`.
5. In that Cloud project, enable both **Google Sheets API** and
   **Google Apps Script API**.
6. Deploy the script as an **API executable**. Allow the Google accounts that
   use the application to execute it (`Anyone` means any signed-in Google user,
   not anonymous access).
7. Copy the deployment ID.
8. For local development, put it in `.env.local`:

   ```text
   VITE_APPS_SCRIPT_DEPLOYMENT_ID=DEPLOYMENT_ID
   ```

9. For GitHub Pages, create the repository variable
   `APPS_SCRIPT_DEPLOYMENT_ID` under **Settings → Secrets and variables →
   Actions → Variables**. The workflow exposes it to Vite during the build.
10. Open the app. An editor will be offered the additive schema upgrade that
    appends `מזהה בקשה` to `תנועות`. Complete that upgrade before writing.

Users may receive a new Google consent prompt because executing the script
requires the Sheets and email scopes declared in the manifest. The script runs
with the accessing user's authorization; that user must have edit access to the
selected spreadsheet.

When `Code.gs` changes, create a new Apps Script version and update the existing
API-executable deployment to that version. If Google issues a new deployment ID,
update the local/GitHub variable and rebuild the frontend.
