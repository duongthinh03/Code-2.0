import 'dotenv/config';
import { google } from 'googleapis';
import { safeError, withRetry } from './reliability.js';
import { googleAuth } from './google-auth.js';

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const range = process.env.GOOGLE_SHEET_RANGE ?? 'Leads!A:N';

async function main(): Promise<void> {
  if (!spreadsheetId || (!credentialsPath && process.env.GOOGLE_AUTH_MODE !== 'oauth')) {
    throw new Error(
      'Thiếu GOOGLE_APPLICATION_CREDENTIALS hoặc GOOGLE_SHEET_ID trong file .env',
    );
  }

  const auth = googleAuth({
    credentialsPath: credentialsPath ?? '', spreadsheetId, sheetRange: range, webhookUrl: '',
    googleAuth: process.env.GOOGLE_AUTH_MODE === 'oauth' ? 'oauth' : 'service_account',
    oauthClientFile: process.env.GOOGLE_OAUTH_CLIENT_FILE ?? './secrets/oauth-client.json',
    oauthTokenFile: process.env.GOOGLE_OAUTH_TOKEN_FILE ?? './secrets/oauth-token.json',
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const response = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  }));

  const rows = response.data.values ?? [];

  console.log(`Đọc được ${rows.length} dòng từ ${range}`);
  console.log('Không in dữ liệu khách hàng ra log.');
}

main().catch((error: unknown) => {
  console.error('Không đọc được Google Sheet:', safeError(error));
  process.exitCode = 1;
});
