import { readFileSync } from 'node:fs';
import { google } from 'googleapis';
import type { RuntimeConfig } from './types.js';

export function oauthClient(path: string, redirect?: string) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const client = data.installed;
  if (!client?.client_id || !client?.client_secret) throw new Error('Cần OAuth client loại Desktop app');
  return new google.auth.OAuth2(client.client_id, client.client_secret, redirect);
}

export function googleAuth(config: RuntimeConfig) {
  if (config.googleAuth !== 'oauth') return new google.auth.GoogleAuth({
    keyFile: config.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = oauthClient(config.oauthClientFile!);
  const token = JSON.parse(readFileSync(config.oauthTokenFile!, 'utf8'));
  if (!token.refresh_token) throw new Error('Thiếu refresh_token; chạy npm run auth:google');
  client.setCredentials(token);
  return client;
}
