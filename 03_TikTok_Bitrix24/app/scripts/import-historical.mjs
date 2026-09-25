import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const args = process.argv.slice(2);
const position = args.indexOf('--file');
const filename = position < 0 ? undefined : args[position + 1];
if (!filename) throw new Error('Usage: npm run mock:import -- --file examples/historical-leads.jsonl');
const secret = process.env.MOCK_TIKTOK_WEBHOOK_SECRET;
if (!secret) throw new Error('Set MOCK_TIKTOK_WEBHOOK_SECRET in .env');

const content = await readFile(filename, 'utf8');
const lines = content.split(/\r?\n/).filter((line) => line.trim());
let accepted = 0;
let duplicate = 0;
let failed = 0;
for (const [index, line] of lines.entries()) {
  let source;
  try { source = JSON.parse(line); }
  catch { throw new Error(`Invalid JSON on line ${index + 1}`); }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`Expected JSON object on line ${index + 1}`);
  }
  const eventId = source.event_id ?? `historical-${createHash('sha256').update(line).digest('hex').slice(0, 24)}`;
  const payload = { ...source, event_id: eventId, event_type: source.event_type ?? 'lead.generate' };
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const response = await fetch('http://localhost:3000/webhooks/tiktok/leads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mock-tiktok-timestamp': timestamp,
      'x-mock-tiktok-signature': signature,
    },
    body,
  });
  if (response.ok) {
    const result = await response.json();
    if (result.duplicate) duplicate++;
    else accepted++;
  } else {
    failed++;
    console.error(`Line ${index + 1}: HTTP ${response.status} ${await response.text()}`);
  }
  // Stay below the mock rate limit without bypassing it.
  await new Promise((resolve) => setTimeout(resolve, 600));
}
console.log(JSON.stringify({ rows: lines.length, accepted, duplicate, failed }));
if (failed) process.exitCode = 1;
