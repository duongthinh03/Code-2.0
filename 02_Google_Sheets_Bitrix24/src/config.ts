import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HeaderKey, MappingConfig, RuntimeConfig } from './types.js';

const requiredHeaderKeys: HeaderKey[] = [
  'name',
  'email',
  'phone',
  'company',
  'utmSource',
  'budget',
  'leadStatus',
  'assignee',
  'notes',
  'syncStatus',
  'leadId',
  'lastSyncedAt',
  'syncError',
  'syncHash',
];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Thiếu ${name} trong file .env`);
  }
  return value;
}

export function loadMapping(): MappingConfig {
  const mappingFile = process.env.MAPPING_FILE?.trim() || './mapping.json';
  const absolutePath = resolve(process.cwd(), mappingFile);

  if (!existsSync(absolutePath)) {
    throw new Error(`Không tìm thấy file mapping: ${mappingFile}`);
  }

  let mapping: MappingConfig;
  try {
    mapping = JSON.parse(readFileSync(absolutePath, 'utf8')) as MappingConfig;
  } catch {
    throw new Error(`File mapping không phải JSON hợp lệ: ${mappingFile}`);
  }

  if (!mapping.sheetName?.trim()) {
    throw new Error('mapping.json thiếu sheetName');
  }

  for (const key of requiredHeaderKeys) {
    if (!mapping.headers?.[key]?.trim()) {
      throw new Error(`mapping.json thiếu tên cột cho "${key}"`);
    }
  }

  if (!mapping.bitrix?.titleTemplate?.trim()) {
    throw new Error('mapping.json thiếu bitrix.titleTemplate');
  }

  return mapping;
}

export function loadRuntimeConfig(mapping: MappingConfig): RuntimeConfig {
  const googleAuth = process.env.GOOGLE_AUTH_MODE ?? 'service_account';
  if (googleAuth !== 'service_account' && googleAuth !== 'oauth') throw new Error('GOOGLE_AUTH_MODE phải là service_account hoặc oauth');
  if ((process.env.SYNC_DIRECTION ?? 'sheets_to_bitrix') !== 'sheets_to_bitrix') throw new Error('Chỉ hỗ trợ SYNC_DIRECTION=sheets_to_bitrix');
  const sheetRange = process.env.GOOGLE_SHEET_RANGE?.trim() || `${mapping.sheetName}!A:N`;

  return {
    googleAuth,
    credentialsPath: googleAuth === 'service_account' ? requireEnv('GOOGLE_APPLICATION_CREDENTIALS') : '',
    oauthClientFile: process.env.GOOGLE_OAUTH_CLIENT_FILE ?? './secrets/oauth-client.json',
    oauthTokenFile: process.env.GOOGLE_OAUTH_TOKEN_FILE ?? './secrets/oauth-token.json',
    spreadsheetId: requireEnv('GOOGLE_SHEET_ID'),
    sheetRange,
    webhookUrl: requireEnv('BITRIX_WEBHOOK_URL').replace(/\/+$/, ''),
  };
}
