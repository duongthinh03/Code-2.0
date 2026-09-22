import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { BitrixClient } from './bitrix-client.js';
import { loadMapping, loadRuntimeConfig } from './config.js';
import { makeSyncHash } from './normalizers.js';
import { checkPhoneFormats, createSheetsClient, readSheetLeads, writeSyncWritebacks } from './sheets-client.js';
import { syncOne } from './sync-engine.js';
import { acquireLock, openJournal } from './state.js';
import { safeError } from './reliability.js';
import type { SyncWriteback } from './types.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const mapping = loadMapping();
  const config = loadRuntimeConfig(mapping);
  const runId = randomUUID();
  const start = Date.now();
  const directory = join(process.env.STATE_DIR ?? './.state', makeSyncHash({ sheet: config.spreadsheetId, range: config.sheetRange, portal: config.webhookUrl }).slice(0, 20));
  const release = acquireLock(directory);
  try {
    const journal = openJournal(directory);
    const sheets = createSheetsClient(config);
    const bitrix = new BitrixClient(config.webhookUrl);
    const initial = await readSheetLeads(sheets, config, mapping);
    await checkPhoneFormats(sheets, config, initial.layout);
    const snapshot = makeSyncHash(initial);
    const writebacks: SyncWriteback[] = [];
    const summary = { created: 0, updated: 0, skipped: 0, error: 0 };
    const ids = initial.leads.map(lead => lead.leadId).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new Error('Nhiều dòng cùng Lead ID. Sửa liên kết trước khi chạy.');
    console.log(`${dryRun ? '[XEM TRƯỚC] ' : ''}Bắt đầu đồng bộ ${initial.leads.length} dòng. Run ${runId}`);
    for (const lead of initial.leads) {
      const outcome = await syncOne(lead, mapping, bitrix, dryRun, journal);
      summary[outcome.action]++;
      console.log(`[Hàng ${lead.rowNumber}] ${outcome.message}`);
      if (outcome.writeback) writebacks.push(outcome.writeback);
    }
    if (!dryRun && writebacks.length) {
      // Best-effort optimistic guard: avoid writing IDs to rows moved while API calls ran.
      const current = await readSheetLeads(sheets, config, mapping);
      if (makeSyncHash(current) !== snapshot) throw new Error('Sheet đã thay đổi trong lúc chạy. Chưa ghi trạng thái; giữ nguyên dữ liệu và chạy lại để khôi phục từ journal.');
      await writeSyncWritebacks(sheets, config, initial.layout, writebacks);
      console.log(`Đã ghi kết quả về ${writebacks.length} dòng Sheet.`);
    }
    console.log(`Tổng kết: tạo ${summary.created}, cập nhật ${summary.updated}, bỏ qua ${summary.skipped}, lỗi ${summary.error}.`);
    console.log(JSON.stringify({ runId, dryRun, ...summary, durationMs: Date.now() - start }));
    if (summary.error) process.exitCode = 1;
  } finally { release(); }
}
main().catch(error => { console.error('Không thể đồng bộ:', safeError(error)); process.exitCode = 1; });
