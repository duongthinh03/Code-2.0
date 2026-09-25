import { existsSync } from 'node:fs';
import pg from 'pg';

if (existsSync('.env')) process.loadEnvFile('.env');
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
await client.connect();
try {
  await client.query(
    `INSERT INTO campaign_costs (campaign_id, amount, currency, note)
     VALUES ('spring-sale', 500000, 'VND', 'mock seed for demo')
     ON CONFLICT (campaign_id) DO NOTHING`,
  );
  console.log('Seeded mock campaign cost for spring-sale (idempotent).');
} finally {
  await client.end();
}
