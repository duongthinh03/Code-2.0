const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { DataSource } = require('typeorm');
const { CreateWebhookEvents20260924000000 } = require('./20260924000000-create-webhook-events.cjs');
const { CreateMockBitrixLeads20260924000001 } = require('./20260924000001-create-mock-bitrix-leads.cjs');
const { AddMockLeadIdentities20260924000002 } = require('./20260924000002-add-mock-lead-identities.cjs');
const { AddDemoFeatures20260924000003 } = require('./20260924000003-add-demo-features.cjs');
const { AddCampaignName20260924000004 } = require('./20260924000004-add-campaign-name.cjs');
const { AddMockOutbound20260924000005 } = require('./20260924000005-add-mock-outbound.cjs');
const { PhoneE16420260924000006 } = require('./20260924000006-phone-e164.cjs');
const { AddAutomation20260924000007 } = require('./20260924000007-add-automation.cjs');
const { ReceiptCascade20260924000008 } = require('./20260924000008-receipt-cascade.cjs');
const { CustomFields20260924000009 } = require('./20260924000009-custom-fields.cjs');
const { SoftArchive20260924000010 } = require('./20260924000010-soft-archive.cjs');
const { BitrixSyncState20260924000011 } = require('./20260924000011-bitrix-sync-state.cjs');

const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

module.exports = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  migrations: [
    CreateWebhookEvents20260924000000,
    CreateMockBitrixLeads20260924000001,
    AddMockLeadIdentities20260924000002,
    AddDemoFeatures20260924000003,
    AddCampaignName20260924000004,
    AddMockOutbound20260924000005,
    PhoneE16420260924000006,
    AddAutomation20260924000007,
    ReceiptCascade20260924000008,
    CustomFields20260924000009,
    SoftArchive20260924000010,
    BitrixSyncState20260924000011,
  ],
});
