import { BitrixRestClient } from './bitrix-rest.client';
import { BitrixSyncService } from './bitrix-sync.service';
import type { DataSource } from 'typeorm';

describe('Bitrix24 sync orchestration (no live calls)', () => {
  const oldEnabled = process.env.BITRIX_SYNC_ENABLED;
  const oldUrl = process.env.BITRIX_WEBHOOK_URL;
  afterEach(() => {
    if (oldEnabled === undefined) delete process.env.BITRIX_SYNC_ENABLED;
    else process.env.BITRIX_SYNC_ENABLED = oldEnabled;
    if (oldUrl === undefined) delete process.env.BITRIX_WEBHOOK_URL;
    else process.env.BITRIX_WEBHOOK_URL = oldUrl;
    jest.restoreAllMocks();
  });

  it('does not touch the database or CRM when the write flag is off', async () => {
    delete process.env.BITRIX_SYNC_ENABLED;
    const dataSource = { transaction: jest.fn(), query: jest.fn() } as unknown as DataSource;
    const service = new BitrixSyncService(dataSource);
    expect(await service.syncByMockLeadId('148')).toEqual({ enabled: false, mockLeadId: '148' });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('creates Lead and Deal once, then updates the same Deal on retry', async () => {
    process.env.BITRIX_SYNC_ENABLED = 'true';
    process.env.BITRIX_WEBHOOK_URL = 'https://example.bitrix24.vn/rest/1/test-secret/';
    const state: { bitrix_lead_id: string | null; bitrix_deal_id: string | null } = {
      bitrix_lead_id: null, bitrix_deal_id: null,
    };
    const local = {
      external_lead_id: 'tiktok-123', full_name: 'Demo',
      email: 'demo@example.com', phone: '+84901234567',
      campaign_id: 'spring-sale', campaign_name: 'Spring sale',
      deal_id: '66', deal_title: 'Deal: Demo', deal_status: 'open',
      deal_probability: 30, deal_amount: null, deal_currency: 'VND',
    };
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('FROM bitrix_sync_state') && sql.includes('FOR UPDATE')) return [{ ...state }];
        if (sql.includes('FROM mock_bitrix_leads l')) return [local];
        if (sql.includes('UPDATE bitrix_sync_state')) {
          state.bitrix_lead_id = String(params[1]);
          state.bitrix_deal_id = String(params[2]);
        }
        return [];
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (fn: (value: typeof manager) => Promise<unknown>) => fn(manager)),
      query: jest.fn(),
    } as unknown as DataSource;
    const findLead = jest.spyOn(BitrixRestClient.prototype, 'findLeadByExternalId').mockResolvedValue(null);
    const addLead = jest.spyOn(BitrixRestClient.prototype, 'addLead').mockResolvedValue(148);
    const updateLead = jest.spyOn(BitrixRestClient.prototype, 'updateLead').mockResolvedValue();
    const findDeal = jest.spyOn(BitrixRestClient.prototype, 'findDealByExternalId').mockResolvedValue(null);
    const addDeal = jest.spyOn(BitrixRestClient.prototype, 'addDeal').mockResolvedValue(66);
    const updateDeal = jest.spyOn(BitrixRestClient.prototype, 'updateDeal').mockResolvedValue();
    const service = new BitrixSyncService(dataSource);
    expect(await service.syncByMockLeadId('148')).toMatchObject({ bitrixLeadId: 148, bitrixDealId: 66 });
    local.deal_status = 'won';
    local.deal_amount = '1000000.00';
    expect(await service.syncByMockLeadId('148')).toMatchObject({ bitrixLeadId: 148, bitrixDealId: 66 });
    expect(findLead).toHaveBeenCalledTimes(1);
    expect(addLead).toHaveBeenCalledTimes(1);
    expect(updateLead).toHaveBeenCalledTimes(1);
    expect(findDeal).toHaveBeenCalledTimes(1);
    expect(addDeal).toHaveBeenCalledTimes(1);
    expect(updateDeal).toHaveBeenCalledTimes(1);
    expect(updateDeal.mock.calls[0][1]).toMatchObject({ stageId: 'WON', amount: 1000000 });
  });
});
