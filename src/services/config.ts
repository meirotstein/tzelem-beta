export const GOOGLE_API_KEY =
  import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyBqkmtsyrL9cZo5gnvCQsi_7cjj9mTo10w';

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '405201608861-r6i2r3pju0e3lvlt2m40b3d6drf9ik73.apps.googleusercontent.com';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ');

export const DISCOVERY_DOCS = [
  'https://sheets.googleapis.com/$discovery/rest?version=v4',
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
];

export const SPREADSHEET_STORAGE_KEY = 'tzelem-spreadsheet-id';
export const GOOGLE_SIGNED_IN_STORAGE_KEY = 'tzelem-google-signed-in';
export const GOOGLE_LOGIN_HINT_STORAGE_KEY = 'tzelem-google-login-hint';
