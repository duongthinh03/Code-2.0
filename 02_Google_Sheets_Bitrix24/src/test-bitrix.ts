import 'dotenv/config';
import axios from 'axios';
import { safeError } from './reliability.js';

const webhookUrl = process.env.BITRIX_WEBHOOK_URL?.replace(/\/+$/, '');

if (!webhookUrl) {
  throw new Error('Thiếu BITRIX_WEBHOOK_URL trong file .env');
}

async function main(): Promise<void> {
  const response = await axios.get(`${webhookUrl}/crm.lead.fields.json`);
  if (response.data?.error) throw new Error(response.data.error_description ?? response.data.error);
  const fields = response.data?.result ?? {};
  console.log(`Kết nối Bitrix24 OK. Nhận được ${Object.keys(fields).length} trường Lead.`);
  console.log('Một số trường:', Object.keys(fields).slice(0, 10));
}

main().catch((error: unknown) => {
  console.error('Không gọi được Bitrix24:', safeError(error));
  process.exitCode = 1;
});
