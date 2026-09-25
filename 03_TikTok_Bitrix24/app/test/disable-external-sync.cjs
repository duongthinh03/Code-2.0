const { existsSync } = require('node:fs');
const { join } = require('node:path');

// Jest loads this before application modules. Tests must never inherit the
// developer's live Bitrix24 write flag, database, or BullMQ queue.
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
const baseDatabase = process.env.DB_NAME;
if (!baseDatabase || !/^[a-z][a-z0-9_]{0,48}$/.test(baseDatabase)) {
  throw new Error('Tests require a safe DB_NAME to derive an isolated database');
}
if (!baseDatabase.endsWith('_jest')) process.env.DB_NAME = `${baseDatabase}_jest`;
process.env.BITRIX_SYNC_ENABLED = 'false';
process.env.BULLMQ_PREFIX = `jest-leads-${process.pid}`;
