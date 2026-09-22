import { google } from 'googleapis';
import { googleAuth } from './google-auth.js';
import { withRetry } from './reliability.js';
import type { sheets_v4 } from 'googleapis';
import type {
  HeaderKey,
  MappingConfig,
  RuntimeConfig,
  SheetLayout,
  SheetLead,
  SyncWriteback,
} from './types.js';

function getRangeStartRow(range: string): number {
  const partAfterSheetName = range.includes('!') ? range.split('!').slice(1).join('!') : range;
  const match = /^\$?[A-Z]+\$?(\d+)?/i.exec(partAfterSheetName);
  const row = Number(match?.[1] ?? '1');
  return Number.isInteger(row) && row > 0 ? row : 1;
}

function getSheetName(range: string, fallback: string): string {
  const separator = range.indexOf('!');
  return separator >= 0 ? range.slice(0, separator) : fallback;
}

function toA1Column(columnIndex: number): string {
  let value = columnIndex + 1;
  let output = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }

  return output;
}

function getCell(row: string[], index: number): string {
  return row[index]?.trim() ?? '';
}

function createLayout(headerRow: string[], mapping: MappingConfig, range: string): SheetLayout {
  const headerIndexes = {} as Record<HeaderKey, number>;
  const actualHeaders = new Map<string, number>();

  for (const [index, header] of headerRow.entries()) {
    if (header.trim() && actualHeaders.has(header.trim())) throw new Error(`Trùng tiêu đề cột: ${header}`);
    actualHeaders.set(header.trim(), index);
  }

  const missing: string[] = [];
  for (const key of Object.keys(mapping.headers) as HeaderKey[]) {
    const expectedHeader = mapping.headers[key];
    const index = actualHeaders.get(expectedHeader.trim());

    if (index === undefined) {
      missing.push(expectedHeader);
    } else {
      headerIndexes[key] = index;
    }
  }

  if (missing.length > 0) {
    throw new Error(`Sheet thiếu cột: ${missing.join(', ')}`);
  }

  return {
    sheetName: getSheetName(range, mapping.sheetName),
    columnOffset: columnOffset(range),
    headerIndexes,
  };
}

function toSheetLead(
  row: string[],
  rowNumber: number,
  headerRow: string[],
  layout: SheetLayout,
): SheetLead {
  const source: Record<string, string> = {};
  for (const [index, header] of headerRow.entries()) {
    const name = header.trim();
    if (name) {
      source[name] = getCell(row, index);
    }
  }

  const value = (key: HeaderKey): string => getCell(row, layout.headerIndexes[key]);

  return {
    rowNumber,
    source,
    name: value('name'),
    email: value('email'),
    phone: value('phone'),
    company: value('company'),
    utmSource: value('utmSource'),
    budget: value('budget'),
    leadStatus: value('leadStatus'),
    assignee: value('assignee'),
    notes: value('notes'),
    syncStatus: value('syncStatus'),
    leadId: value('leadId'),
    lastSyncedAt: value('lastSyncedAt'),
    syncError: value('syncError'),
    syncHash: value('syncHash'),
  };
}

function hasBusinessData(lead: SheetLead): boolean {
  return [
    lead.name,
    lead.email,
    lead.phone,
    lead.company,
    lead.utmSource,
    lead.budget,
    lead.leadStatus,
    lead.assignee,
    lead.notes,
  ].some((value) => value.length > 0);
}

export function createSheetsClient(config: RuntimeConfig): sheets_v4.Sheets {
  const auth = googleAuth(config);

  return google.sheets({ version: 'v4', auth });
}

export async function readSheetLeads(
  sheets: sheets_v4.Sheets,
  config: RuntimeConfig,
  mapping: MappingConfig,
): Promise<{ layout: SheetLayout; leads: SheetLead[] }> {
  const response = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: config.sheetRange,
    valueRenderOption: 'UNFORMATTED_VALUE',
  }));

  const rows = (response.data.values ?? []).map((row) => row.map((cell) => String(cell ?? '')));
  const headerRow = rows[0];

  if (!headerRow) {
    throw new Error('Google Sheet đang trống, cần có dòng tiêu đề ở hàng đầu tiên');
  }

  const layout = createLayout(headerRow, mapping, config.sheetRange);
  const firstRowNumber = getRangeStartRow(config.sheetRange);
  const leads = rows
    .slice(1)
    .map((row, index) => toSheetLead(row, firstRowNumber + index + 1, headerRow, layout))
    .filter(hasBusinessData);

  return { layout, leads };
}

function formatSheetName(sheetName: string): string {
  if (sheetName.startsWith("'") && sheetName.endsWith("'")) {
    return sheetName;
  }
  return `'${sheetName.replace(/'/g, "''")}'`;
}

export async function writeSyncWritebacks(
  sheets: sheets_v4.Sheets,
  config: RuntimeConfig,
  layout: SheetLayout,
  writebacks: SyncWriteback[],
): Promise<void> {
  if (writebacks.length === 0) {
    return;
  }

  const sheetName = formatSheetName(layout.sheetName);
  const data: sheets_v4.Schema$ValueRange[] = [];
  const fields: Array<keyof Omit<SyncWriteback, 'rowNumber'>> = [
    'syncStatus',
    'leadId',
    'lastSyncedAt',
    'syncError',
    'syncHash',
  ];

  for (const writeback of writebacks) {
    for (const field of fields) {
      const headerKey = field as HeaderKey;
      const cell = `${toA1Column(layout.headerIndexes[headerKey] + (layout.columnOffset ?? 0))}${writeback.rowNumber}`;
      data.push({
        range: `${sheetName}!${cell}`,
        values: [[writeback[field]]],
      });
    }
  }

  await withRetry(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  }));
}

function columnOffset(range: string): number {
  const part = range.slice(range.lastIndexOf('!') + 1);
  const letters = /^\$?([A-Z]+)(?:\$?\d+)?(?::\$?[A-Z]+(?:\$?\d+)?)?$/i.exec(part)?.[1]?.toUpperCase();
  if (!letters) throw new Error('GOOGLE_SHEET_RANGE phải dùng A1 notation');
  return [...letters].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

export async function checkPhoneFormats(sheets: sheets_v4.Sheets, config: RuntimeConfig, layout: SheetLayout): Promise<void> {
  const response = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId, ranges: [config.sheetRange],
    includeGridData: true, fields: 'sheets(data(rowData(values(effectiveValue,effectiveFormat(numberFormat)))))',
  }));
  const index = layout.headerIndexes.phone;
  for (const sheet of response.data.sheets ?? []) for (const grid of sheet.data ?? []) {
    for (const row of (grid.rowData ?? []).slice(1)) {
      if (row.values?.[index]?.effectiveValue?.numberValue !== undefined)
        throw new Error('Cột Điện thoại chứa ô dạng số. Chuyển sang Plain text và nhập lại số có số 0 đầu.');
    }
  }
}
