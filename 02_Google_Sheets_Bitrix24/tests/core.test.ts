import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxiosError, type AxiosInstance } from 'axios';
import type { sheets_v4 } from 'googleapis';
import { loadMapping, loadRuntimeConfig } from '../src/config.js';
import { normalizeText, normalizeEmail, normalizePhone, parseBudget, makeSyncHash, isValidEmail } from '../src/normalizers.js';
import { buildBitrixFields, validateLead } from '../src/mapper.js';
import { syncOne } from '../src/sync-engine.js';
import { ApiError, safeError, withRetry } from '../src/reliability.js';
import { acquireLock, openJournal } from '../src/state.js';
import { BitrixClient } from '../src/bitrix-client.js';
import { readSheetLeads, writeSyncWritebacks, checkPhoneFormats, createSheetsClient } from '../src/sheets-client.js';
import { googleAuth, oauthClient } from '../src/google-auth.js';
import type { SheetLead, RuntimeConfig, BitrixLeadFields } from '../src/types.js';

const mapping = loadMapping();
const lead = (changes: Partial<SheetLead> = {}): SheetLead => ({ rowNumber: 2, source: {}, name: 'Demo', email: 'demo@example.com', phone: '0901234567', company: 'Demo', utmSource: 'Google', budget: '5000000', leadStatus: 'NEW', assignee: '', notes: 'hello', syncStatus: '', leadId: '', lastSyncedAt: '', syncError: '', syncHash: '', ...changes });
const config: RuntimeConfig = { credentialsPath: 'unused', spreadsheetId: 'test', sheetRange: 'Leads!A:N', webhookUrl: 'https://example.invalid/rest/1/test/' };
const fakeCRM = () => ({ getLead: async (id: string) => ({ ID: id }), findPotentialDuplicates: async (_email: string, _phone: string): Promise<{ ID: string }[]> => [], createLead: async (_fields: BitrixLeadFields) => '3', updateLead: async (_id: string, _fields: BitrixLeadFields) => {} });

test('normalization, strict VND and stable hash', () => {
  assert.equal(normalizeText(' a  b '), 'a b');
  assert.equal(normalizeEmail(' X@Example.COM '), 'x@example.com');
  assert.equal(normalizePhone('+84 901 234 567'), '0901234567');
  assert.equal(normalizePhone('0084901234567'), '0901234567');
  for (const s of ['5000000', '5,000,000', '5.000.000', '5 000 000']) assert.equal(parseBudget(s), 5000000);
  for (const s of ['', '-1', '12abc', '1.5', '1,000.000', '9007199254740992']) assert.equal(parseBudget(s), undefined);
  assert.equal(parseBudget('0'), 0);
  assert.ok(isValidEmail('demo@example.com'));
  assert.ok(!isValidEmail('email-sai'));
  assert.equal(makeSyncHash({ b: [{ y: 1, x: 2 }], a: null }), makeSyncHash({ a: null, b: [{ x: 2, y: 1 }] }));
});

test('mapping, default status, custom fields, owner, validation', () => {
  const custom = structuredClone(mapping);
  custom.bitrix.assigneeIdMap = { Owner: 9 };
  custom.bitrix.customFieldMap = { Extra: 'UF_CRM_DEMO' };
  custom.bitrix.sourceId = 'WEB';
  const fields = buildBitrixFields(lead({ source: { Extra: ' value ' }, assignee: 'Owner', leadStatus: '' }), custom);
  assert.equal(fields.ASSIGNED_BY_ID, 9); assert.equal(fields.UF_CRM_DEMO, 'value');
  assert.equal(fields.STATUS_ID, 'NEW'); assert.equal(fields.SOURCE_ID, 'WEB');
  assert.equal(fields.OPPORTUNITY, 5000000);
  assert.equal(validateLead(lead()), undefined);
  assert.match(validateLead(lead({ name: '', email: '', phone: '', budget: 'bad' }))!, /thiếu Tên/);
  assert.match(validateLead(lead({ email: 'email-sai' }))!, /Email/);
  custom.bitrix.titleTemplate = '{{unknown}}';
  assert.equal(buildBitrixFields(lead({ email: '', phone: '', budget: '', notes: '' }), custom).TITLE, 'Lead từ Google Sheets');
});

test('retry bounded, Retry-After, permanent failures and redaction', async () => {
  const delays: number[] = []; let attempts = 0;
  assert.equal(await withRetry(async () => { if (++attempts < 3) throw new ApiError('busy', true); return 42; }, async ms => { delays.push(ms); }), 42);
  assert.deepEqual(delays, [500, 1000]);
  attempts = 0;
  await assert.rejects(withRetry(async () => { attempts++; throw { response: { status: 429, headers: { 'retry-after': '120' } } }; }, async ms => { assert.equal(ms, 60000); }));
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(withRetry(async () => { attempts++; throw new Error('invalid'); })); assert.equal(attempts, 1);
  await assert.rejects(withRetry(async () => { throw { code: 'ECONNRESET' }; }, async () => {}));
  assert.ok(!safeError(new Error('https://example.com/secret Bearer abc')).includes('secret'));
  assert.equal(safeError(null), 'Lỗi không xác định');
});

test('TC1/TC2: create, update, skip, repair error tracking, dry-run', async () => {
  const crm = fakeCRM(); let creates = 0; let updates = 0;
  crm.createLead = async () => { creates++; return '3'; };
  crm.updateLead = async () => { updates++; };
  assert.equal((await syncOne(lead(), mapping, crm, true)).action, 'created'); assert.equal(creates, 0);
  const created = await syncOne(lead(), mapping, crm, false);
  assert.equal(created.writeback?.leadId, '3'); assert.equal(creates, 1);
  const linked = lead(created.writeback!);
  assert.equal((await syncOne(linked, mapping, crm, false)).action, 'skipped');
  const repaired = await syncOne({ ...linked, syncStatus: 'Lỗi', syncError: 'old' }, mapping, crm, false);
  assert.equal(repaired.writeback?.syncError, '');
  assert.equal((await syncOne({ ...linked, notes: 'changed' }, mapping, crm, true)).action, 'updated'); assert.equal(updates, 0);
  assert.equal((await syncOne({ ...linked, notes: 'changed' }, mapping, crm, false)).action, 'updated'); assert.equal(updates, 1);
  assert.equal((await syncOne(lead({ email: 'bad' }), mapping, crm, true)).writeback, undefined);
  assert.equal((await syncOne(lead({ email: 'bad' }), mapping, crm, false)).action, 'error');
});

test('TC3/TC4: dedupe, conflicts, missing ID, ambiguous creation recovery', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bitrix-tests-'));
  try {
    const journal = openJournal(dir); const crm = fakeCRM();
    crm.findPotentialDuplicates = async () => [{ ID: '9' }];
    assert.equal((await syncOne(lead(), mapping, crm, false)).writeback?.leadId, '9');
    assert.equal((await syncOne(lead(), mapping, crm, true)).action, 'updated');
    crm.findPotentialDuplicates = async () => [{ ID: '9' }, { ID: '10' }];
    assert.equal((await syncOne(lead(), mapping, crm, false)).action, 'error');
    crm.findPotentialDuplicates = async () => [];
    crm.getLead = async () => { throw new Error('not found'); };
    assert.equal((await syncOne(lead({ leadId: '99' }), mapping, crm, false)).action, 'error');
    crm.createLead = async () => { throw new Error('timeout'); };
    assert.equal((await syncOne(lead(), mapping, crm, false, journal)).action, 'error');
    const pending = await syncOne(lead(), mapping, crm, false, journal); assert.match(pending.message, /chưa rõ kết quả/);
    crm.findPotentialDuplicates = async () => [{ ID: '12' }];
    assert.equal((await syncOne(lead(), mapping, crm, false, journal)).writeback?.leadId, '12');
    const release = acquireLock(dir); assert.throws(() => acquireLock(dir), /sync.lock/); release();
    const release2 = acquireLock(dir); release2();
    journal.set('persist', { id: '3' }); assert.equal(openJournal(dir).get('persist')?.id, '3');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('120-row simulated integration: create → persisted recovery → unchanged → update', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bitrix-120-')); const started = performance.now();
  try {
    const records = new Map<string, BitrixLeadFields>(); const crm = fakeCRM(); const journal = openJournal(dir);
    crm.createLead = async fields => { const id = String(records.size + 1); records.set(id, fields); return id; };
    crm.getLead = async id => { assert.ok(records.has(id)); return { ID: id }; };
    crm.updateLead = async (id, fields) => { records.set(id, fields); };
    const rows = Array.from({ length: 120 }, (_, i) => lead({ rowNumber: i + 2, email: `test${i}@example.com`, phone: '', name: `Test ${i}` }));
    for (const row of rows) {
      const created = await syncOne(row, mapping, crm, false, journal); assert.equal(created.action, 'created');
      // Simulate successful CRM creation but failed Sheet write-back.
      const recovery = await syncOne(row, mapping, crm, false, openJournal(dir)); assert.equal(recovery.action, 'updated');
      Object.assign(row, recovery.writeback);
    }
    assert.equal(records.size, 120);
    for (const row of rows) assert.equal((await syncOne(row, mapping, crm, false, journal)).action, 'skipped');
    for (const row of rows) assert.equal((await syncOne({ ...row, notes: 'updated' }, mapping, crm, false, journal)).action, 'updated');
    assert.equal(records.size, 120);
    console.log(`SIMULATED_120_ROWS durationMs=${Math.round(performance.now() - started)} records=${records.size}; no external API calls`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Bitrix direct dedupe validates active candidates and single-email requests', async () => {
  const calls: string[] = [];
  const http = { post: async (url: string, payload: Record<string, unknown>) => {
    calls.push(url);
    if (url === 'crm.duplicate.findbycomm.json') {
      assert.deepEqual(payload.entity_type, 'LEAD');
      assert.deepEqual(payload.values, [payload.type === 'EMAIL' ? 'a@b.c' : '0901']);
      return { data: { result: { LEAD: payload.type === 'EMAIL' ? [1, 2, 'bad'] : [2, 3] } } };
    }
    return { data: { result: [{ ID: '1', STATUS_SEMANTIC_ID: 'S' }, { ID: '2', STATUS_SEMANTIC_ID: 'P' }, { ID: '99', STATUS_SEMANTIC_ID: 'P' }] } };
  } } as unknown as AxiosInstance;
  const client = new BitrixClient(config.webhookUrl, http, 0);
  assert.deepEqual(await client.findPotentialDuplicates('a@b.c', '0901'), [{ ID: '2', STATUS_SEMANTIC_ID: 'P' }]);
  assert.equal(calls.length, 3); assert.deepEqual(await client.findPotentialDuplicates('', ''), []);
  calls.length = 0;
  assert.deepEqual(await client.findPotentialDuplicates('a@b.c', ''), [{ ID: '2', STATUS_SEMANTIC_ID: 'P' }]);
  assert.deepEqual(calls, ['crm.duplicate.findbycomm.json', 'crm.lead.list.json']);
  http.post = (async () => ({ data: { error: 'ACCESS_DENIED' } })) as typeof http.post;
  await assert.rejects(client.findPotentialDuplicates('a', ''), /ACCESS_DENIED/);
  http.post = (async () => ({ data: {} })) as typeof http.post;
  await assert.rejects(client.findPotentialDuplicates('a', ''), /thiếu/);
});

test('Bitrix CRUD rejects bad responses; add never retries uncertain error', async () => {
  let result: unknown = 3; let attempts = 0;
  const http = { post: async () => { attempts++; return { data: { result } }; } } as unknown as AxiosInstance;
  const client = new BitrixClient(config.webhookUrl, http, 0);
  assert.equal(await client.createLead({}), '3'); result = false; await assert.rejects(client.createLead({}));
  await assert.rejects(client.updateLead('3', {})); result = true; await client.updateLead('3', {});
  result = { ID: 3 }; assert.equal((await client.getLead('3')).ID, '3'); await assert.rejects(client.getLead('9'));
  result = undefined; await assert.rejects(client.getLead('3'), /thiếu result/);
  http.post = (async () => { attempts++; throw new ApiError('timeout', true); }) as typeof http.post;
  const before = attempts; await assert.rejects(client.createLead({})); assert.equal(attempts - before, 1);
  http.post = (async () => ({ data: { error: 'ACCESS_DENIED' } })) as typeof http.post;
  await assert.rejects(client.getLead('3'), /ACCESS_DENIED/);
  http.post = (async () => { throw new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST',
    undefined, undefined, { status: 400, data: { error: 'Communication values is not defined', error_description: "Parameter 'values' is required." }, headers: {}, config: {} as never, statusText: 'Bad Request' }); }) as typeof http.post;
  await assert.rejects(client.findPotentialDuplicates('a@b.c', ''), /crm\.duplicate\.findbycomm HTTP 400: Parameter 'values' is required/);
  assert.throws(() => new BitrixClient('', http, -1));
});

test('Sheets: typed reads, ranges/offsets, missing headers and batched tracking writes', async () => {
  let rows: unknown[][] = [Object.values(mapping.headers), ['Demo', 'demo@example.com', '0901234567', '', '', 5000000], []];
  let written: any; let grid: any[] = [];
  const sheets = { spreadsheets: { values: { get: async () => ({ data: { values: rows } }), batchUpdate: async (payload: unknown) => { written = payload; return {}; } }, get: async () => ({ data: { sheets: [{ data: [{ rowData: [{}, ...grid] }] }] } }) } } as unknown as sheets_v4.Sheets;
  const shifted = { ...config, sheetRange: "'Test Sheet'!C5:P" };
  const { layout, leads } = await readSheetLeads(sheets, shifted, mapping);
  assert.equal(leads.length, 1); assert.equal(leads[0]?.rowNumber, 6); assert.equal(leads[0]?.budget, '5000000');
  const bounded = await readSheetLeads(sheets, { ...config, sheetRange: 'Leads!A:N1000' }, mapping);
  assert.equal(bounded.leads[0]?.rowNumber, 2);
  const outcome = await syncOne(leads[0]!, mapping, fakeCRM(), false);
  await writeSyncWritebacks(sheets, shifted, layout, [outcome.writeback!]);
  assert.equal(written.requestBody.data[0].range, "'Test Sheet'!L6"); assert.equal(written.requestBody.data.length, 5);
  await writeSyncWritebacks(sheets, shifted, layout, []);
  await checkPhoneFormats(sheets, config, layout);
  grid = [{ values: [{}, {}, { effectiveValue: { numberValue: 901234567 } }] }];
  await assert.rejects(checkPhoneFormats(sheets, config, layout), /Plain text/);
  rows = []; await assert.rejects(readSheetLeads(sheets, config, mapping), /trống/);
  rows = [['Tên']]; await assert.rejects(readSheetLeads(sheets, config, mapping), /thiếu cột/);
  rows = [['Tên', 'Tên']]; await assert.rejects(readSheetLeads(sheets, config, mapping), /Trùng/);
  rows = [Object.values(mapping.headers)];
  await assert.rejects(readSheetLeads(sheets, { ...config, sheetRange: '1:3' }, mapping), /A1/);
  const plain = await readSheetLeads(sheets, { ...config, sheetRange: 'A:N' }, mapping); assert.equal(plain.layout.sheetName, 'Leads');
});

test('config and Google auth: fail safely, construct service account/OAuth without network', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bitrix-auth-')); const previous = { ...process.env };
  try {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = 'unused'; process.env.GOOGLE_SHEET_ID = 'sheet'; process.env.BITRIX_WEBHOOK_URL = config.webhookUrl;
    delete process.env.GOOGLE_AUTH_MODE; delete process.env.SYNC_DIRECTION;
    assert.equal(loadRuntimeConfig(mapping).googleAuth, 'service_account');
    process.env.GOOGLE_AUTH_MODE = 'oauth'; assert.equal(loadRuntimeConfig(mapping).googleAuth, 'oauth');
    process.env.GOOGLE_AUTH_MODE = 'bad'; assert.throws(() => loadRuntimeConfig(mapping));
    process.env.GOOGLE_AUTH_MODE = 'oauth'; process.env.SYNC_DIRECTION = 'two_way'; assert.throws(() => loadRuntimeConfig(mapping));
    delete process.env.SYNC_DIRECTION; delete process.env.GOOGLE_SHEET_ID; assert.throws(() => loadRuntimeConfig(mapping), /GOOGLE_SHEET_ID/);
    const file = join(dir, 'mapping.json'); process.env.MAPPING_FILE = file;
    assert.throws(() => loadMapping(), /Không tìm/); writeFileSync(file, 'bad'); assert.throws(() => loadMapping(), /JSON/);
    for (const invalid of [{}, { sheetName: 'Leads' }, { ...mapping, bitrix: {} }]) { writeFileSync(file, JSON.stringify(invalid)); assert.throws(() => loadMapping()); }
    writeFileSync(file, JSON.stringify(mapping)); assert.equal(loadMapping().sheetName, mapping.sheetName);
    assert.ok(googleAuth(config)); assert.ok(createSheetsClient(config));
    const clientFile = join(dir, 'client.json'); const tokenFile = join(dir, 'token.json');
    writeFileSync(clientFile, JSON.stringify({ installed: { client_id: 'test', client_secret: 'test' } }));
    assert.ok(oauthClient(clientFile)); writeFileSync(tokenFile, JSON.stringify({ refresh_token: 'fake-test-only' }));
    assert.ok(googleAuth({ ...config, googleAuth: 'oauth', oauthClientFile: clientFile, oauthTokenFile: tokenFile }));
    writeFileSync(tokenFile, '{}'); assert.throws(() => googleAuth({ ...config, googleAuth: 'oauth', oauthClientFile: clientFile, oauthTokenFile: tokenFile }));
    writeFileSync(clientFile, '{}'); assert.throws(() => oauthClient(clientFile));
  } finally { process.env = previous; rmSync(dir, { recursive: true, force: true }); }
});
