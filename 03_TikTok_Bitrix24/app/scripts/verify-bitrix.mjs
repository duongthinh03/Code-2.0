// Read-only check for one previously synced local Lead.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dataSource = require('../migrations/data-source.cjs');
const { BitrixRestClient, BITRIX_ORIGINATOR_ID } = require('../dist/bitrix/bitrix-rest.client.js');

const args = process.argv.slice(2);
const index = args.indexOf('--mock-lead-id');
const mockLeadId = index >= 0 ? args[index + 1] : null;
if (!mockLeadId || !/^\d+$/.test(mockLeadId)) {
  throw new Error('Usage: npm run bitrix:verify -- --mock-lead-id <local-id>');
}

try {
  await dataSource.initialize();
  const rows = await dataSource.query(
    `SELECT l.external_lead_id, s.bitrix_lead_id::int AS bitrix_lead_id,
            s.bitrix_deal_id::int AS bitrix_deal_id
     FROM bitrix_sync_state s JOIN mock_bitrix_leads l ON l.id = s.mock_lead_id
     WHERE s.mock_lead_id = $1 AND s.status = 'synced'`, [mockLeadId],
  );
  const row = rows[0];
  if (!row?.bitrix_lead_id) throw new Error('Local Lead has not been synced');
  const client = new BitrixRestClient(process.env.BITRIX_WEBHOOK_URL ?? '');
  const lead = await client.getItem(1, row.bitrix_lead_id);
  const foundLeadId = await client.findLeadByExternalId(row.external_lead_id);
  if (lead.originatorId !== BITRIX_ORIGINATOR_ID || lead.originId !== row.external_lead_id) {
    throw new Error('Remote Lead source identity does not match');
  }
  if (foundLeadId !== lead.id) throw new Error('Remote Lead origin lookup does not match');
  console.log(`Bitrix24 Lead ${lead.id}: verified`);
  if (row.bitrix_deal_id) {
    const deal = await client.getItem(2, row.bitrix_deal_id);
    const foundDealId = await client.findDealByExternalId(row.external_lead_id);
    if (deal.originatorId !== BITRIX_ORIGINATOR_ID ||
        deal.originId !== `deal:${row.external_lead_id}` || deal.leadId !== lead.id ||
        foundDealId !== deal.id) {
      throw new Error('Remote Deal source identity or Lead link does not match');
    }
    console.log(`Bitrix24 Deal ${deal.id}: linked to Lead ${deal.leadId}, stage ${deal.stageId}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Bitrix24 verification failed');
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
