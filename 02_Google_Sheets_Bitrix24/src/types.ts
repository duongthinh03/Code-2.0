export type HeaderKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'company'
  | 'utmSource'
  | 'budget'
  | 'leadStatus'
  | 'assignee'
  | 'notes'
  | 'syncStatus'
  | 'leadId'
  | 'lastSyncedAt'
  | 'syncError'
  | 'syncHash';

export type BusinessKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'company'
  | 'utmSource'
  | 'budget'
  | 'leadStatus'
  | 'assignee'
  | 'notes';

export interface HeaderConfig extends Record<HeaderKey, string> {}

export interface MappingConfig {
  sheetName: string;
  headers: HeaderConfig;
  bitrix: {
    titleTemplate: string;
    defaultStatusId: string;
    currencyId?: string;
    sourceId?: string;
    fieldMap: Partial<Record<BusinessKey, string>>;
    phone: { field: string; valueType: string };
    email: { field: string; valueType: string };
    customFieldMap: Record<string, string>;
    assigneeIdMap: Record<string, number>;
  };
}

export interface RuntimeConfig {
  googleAuth?: 'service_account' | 'oauth';
  oauthClientFile?: string;
  oauthTokenFile?: string;
  credentialsPath: string;
  spreadsheetId: string;
  sheetRange: string;
  webhookUrl: string;
}

export interface SheetLayout {
  columnOffset?: number;
  sheetName: string;
  headerIndexes: Record<HeaderKey, number>;
}

export interface SheetLead {
  rowNumber: number;
  source: Record<string, string>;
  name: string;
  email: string;
  phone: string;
  company: string;
  utmSource: string;
  budget: string;
  leadStatus: string;
  assignee: string;
  notes: string;
  syncStatus: string;
  leadId: string;
  lastSyncedAt: string;
  syncError: string;
  syncHash: string;
}

export type BitrixLeadFields = Record<string, unknown>;

export interface BitrixLead {
  ID: string;
  STATUS_SEMANTIC_ID?: string;
}

export interface SyncWriteback {
  rowNumber: number;
  syncStatus: string;
  leadId: string;
  lastSyncedAt: string;
  syncError: string;
  syncHash: string;
}

export type SyncAction = 'created' | 'updated' | 'skipped' | 'error';

export interface SyncOutcome {
  action: SyncAction;
  message: string;
  writeback?: SyncWriteback;
}
