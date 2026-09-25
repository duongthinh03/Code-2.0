// Explicit single-record retry/test. Never scans historical Leads.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dataSource = require('../migrations/data-source.cjs');
const { BitrixSyncService } = require('../dist/bitrix/bitrix-sync.service.js');

const args = process.argv.slice(2);
const index = args.indexOf('--mock-lead-id');
const mockLeadId = index >= 0 ? args[index + 1] : null;
if (!mockLeadId || !/^\d+$/.test(mockLeadId)) {
  throw new Error('Usage: npm run bitrix:sync -- --mock-lead-id <local-id>');
}
if (process.env.BITRIX_SYNC_ENABLED !== 'true') {
  throw new Error('BITRIX_SYNC_ENABLED must be true for a CRM write');
}

try {
  await dataSource.initialize();
  const result = await new BitrixSyncService(dataSource).syncByMockLeadId(mockLeadId);
  console.log(`Synced local Lead ${result.mockLeadId} -> Bitrix24 Lead ${result.bitrixLeadId}`);
  if (result.bitrixDealId) console.log(`Bitrix24 Deal ${result.bitrixDealId}`);
} catch (error) {
  // BitrixSyncService and BitrixRestClient produce URL-free errors.
  console.error(error instanceof Error ? error.message : 'Bitrix24 sync failed');
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
