import { existsSync } from 'node:fs';
import pg from 'pg';

if (existsSync('.env')) process.loadEnvFile('.env');
const args = process.argv.slice(2);
const position = args.indexOf('--event-id');
const eventId = position >= 0 ? args[position + 1] : undefined;
if (!eventId) throw new Error('Usage: npm run mock:inspect -- --event-id demo-1');

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
await client.connect();
try {
  const { rows } = await client.query(
    `SELECT e.event_id, e.queue_status, e.last_error, e.mock_lead_id,
            l.external_lead_id, l.full_name, l.email, l.phone, l.campaign_id,
            (SELECT array_agg(x.external_lead_id ORDER BY x.external_lead_id)
             FROM mock_bitrix_lead_external_ids x
             WHERE x.lead_id = l.id) AS linked_external_ids,
            (SELECT count(*)::int FROM mock_bitrix_api_calls c
             WHERE c.response->>'id' = l.id::text) AS mock_api_calls
     FROM webhook_events e
     LEFT JOIN mock_bitrix_leads l ON l.id = e.mock_lead_id
     WHERE e.event_id = $1`,
    [eventId],
  );
  console.log(JSON.stringify(rows[0] ?? { error: 'Event not found' }, null, 2));
} finally {
  await client.end();
}
