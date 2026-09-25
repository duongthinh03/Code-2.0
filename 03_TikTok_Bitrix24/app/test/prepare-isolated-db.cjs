const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');

module.exports = async () => {
  const envPath = join(__dirname, '..', '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const baseDatabase = process.env.DB_NAME;
  if (!baseDatabase || !/^[a-z][a-z0-9_]{0,48}$/.test(baseDatabase)) {
    throw new Error('Tests require a safe DB_NAME to derive an isolated database');
  }
  const testDatabase = baseDatabase.endsWith('_jest')
    ? baseDatabase : `${baseDatabase}_jest`;
  if (testDatabase === 'postgres' || testDatabase === 'template1') {
    throw new Error('Refusing to run tests against a system database');
  }

  const admin = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDatabase]);
    if (!existing.rowCount) await admin.query(`CREATE DATABASE "${testDatabase}"`);
  } finally {
    await admin.end();
  }

  process.env.DB_NAME = testDatabase;
  process.env.BITRIX_SYNC_ENABLED = 'false';
  const dataSource = require('../migrations/data-source.cjs');
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
};
