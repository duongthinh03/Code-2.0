import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
if (process.env.BITRIX_SYNC_ENABLED === 'true' && !args.includes('--allow-live-bitrix-sync')) {
  throw new Error(
    'Refusing mock webhook: this app is configured to sync to real Bitrix24. ' +
    'Restart the app with BITRIX_SYNC_ENABLED=false for a mock-only demo, ' +
    'or pass --allow-live-bitrix-sync only when real CRM test records are intended.',
  );
}
function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const eventIdIndex = args.indexOf('--event-id');
const eventId = eventIdIndex >= 0 ? args[eventIdIndex + 1] : randomUUID();
if (!eventId) throw new Error('--event-id requires a value');

const payload = {
  event_id: eventId,
  event_type: 'lead.generate',
  data: {
    lead_id: option('--lead-id') ?? 'lead-' + eventId,
    full_name: option('--full-name') ?? 'Khách hàng demo',
    email: option('--email') ?? 'demo@example.com',
    phone: args.includes('--no-phone') ? null : (option('--phone') ?? '0901234567'),
    campaign_id: option('--campaign-id') ?? 'mock-campaign-1',
    campaign_name: option('--campaign-name') ?? 'Mock Campaign',
    ad_id: option('--ad-id') ?? 'mock-ad-1',
    form_id: option('--form-id') ?? 'mock-form-1',
  },
};
const body = JSON.stringify(payload);
const timestamp = String(Math.floor(Date.now() / 1000));
const secret = process.env.MOCK_TIKTOK_WEBHOOK_SECRET;
if (!secret) throw new Error('Set MOCK_TIKTOK_WEBHOOK_SECRET in .env');
const signature = createHmac('sha256', secret)
  .update(`${timestamp}.${body}`)
  .digest('hex');

const response = await fetch('http://localhost:3000/webhooks/tiktok/leads', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-mock-tiktok-timestamp': timestamp,
    'x-mock-tiktok-signature': args.includes('--bad-signature') ? '0'.repeat(64) : signature,
  },
  body,
});
console.log('HTTP', response.status);
console.log(await response.text());
if (!response.ok) process.exitCode = 1;
