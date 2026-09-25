import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BitrixDealInput, BitrixRestClient } from './bitrix-rest.client';
import type { MockLeadInput } from '../webhooks/mock-bitrix.client';

type LocalRow = {
  external_lead_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  deal_id: string | null;
  deal_title: string | null;
  deal_status: 'open' | 'won' | 'lost' | null;
  deal_probability: number | null;
  deal_amount: string | null;
  deal_currency: string | null;
};
type SyncRow = { bitrix_lead_id: string | null; bitrix_deal_id: string | null };

@Injectable()
export class BitrixSyncService {
  private readonly enabled = process.env.BITRIX_SYNC_ENABLED === 'true';
  private readonly client: BitrixRestClient | null;
  private readonly categoryId: number;

  constructor(private readonly dataSource: DataSource) {
    const rawCategory = process.env.BITRIX_DEAL_CATEGORY_ID ?? '0';
    this.categoryId = Number(rawCategory);
    if (!Number.isSafeInteger(this.categoryId) || this.categoryId < 0) {
      throw new Error('BITRIX_DEAL_CATEGORY_ID must be a nonnegative integer');
    }
    this.client = this.enabled
      ? new BitrixRestClient(process.env.BITRIX_WEBHOOK_URL ?? '') : null;
  }

  isEnabled() { return this.enabled; }

  async getState(mockLeadId: string) {
    this.validateId(mockLeadId);
    const rows = await this.dataSource.query(
      `SELECT mock_lead_id::text, bitrix_lead_id::text, bitrix_deal_id::text,
              status, last_error, synced_at, updated_at
       FROM bitrix_sync_state WHERE mock_lead_id = $1`, [mockLeadId],
    ) as Array<Record<string, unknown>>;
    return { enabled: this.enabled, state: rows[0] ?? null };
  }

  async syncByMockLeadId(mockLeadId: string) {
    this.validateId(mockLeadId);
    if (!this.client) return { enabled: false, mockLeadId };
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO bitrix_sync_state (mock_lead_id) VALUES ($1)
           ON CONFLICT (mock_lead_id) DO NOTHING`, [mockLeadId],
        );
        // Serialize concurrent jobs for the same Lead while querying/creating the remote items.
        const states = await manager.query(
          `SELECT bitrix_lead_id::text, bitrix_deal_id::text
           FROM bitrix_sync_state WHERE mock_lead_id = $1 FOR UPDATE`, [mockLeadId],
        ) as SyncRow[];
        const rows = await manager.query(
          `SELECT l.external_lead_id, l.full_name, l.email, l.phone,
                  l.campaign_id, l.campaign_name,
                  d.id::text AS deal_id, d.title AS deal_title,
                  d.status AS deal_status, d.probability AS deal_probability,
                  d.amount::text AS deal_amount, d.currency AS deal_currency
           FROM mock_bitrix_leads l
           LEFT JOIN mock_bitrix_deals d ON d.lead_id = l.id AND d.archived_at IS NULL
           WHERE l.id = $1 AND l.archived_at IS NULL`, [mockLeadId],
        ) as LocalRow[];
        const local = rows[0];
        if (!local) throw new NotFoundException('Mock Lead not found');
        const client = this.client!;
        const leadInput: MockLeadInput = {
          externalLeadId: local.external_lead_id,
          fullName: local.full_name, email: local.email, phone: local.phone,
          campaignId: local.campaign_id, campaignName: local.campaign_name,
          adId: null, formId: null, city: null, ttclid: null, rawData: {},
        };
        let bitrixLeadId = states[0].bitrix_lead_id ? Number(states[0].bitrix_lead_id) : null;
        bitrixLeadId ??= await client.findLeadByExternalId(local.external_lead_id);
        if (bitrixLeadId) await client.updateLead(bitrixLeadId, leadInput);
        else bitrixLeadId = await client.addLead(leadInput);
        let bitrixDealId = states[0].bitrix_deal_id ? Number(states[0].bitrix_deal_id) : null;
        if (local.deal_id) {
          const stageId = local.deal_status === 'won' ? 'WON'
            : local.deal_status === 'lost' ? 'LOSE' : 'NEW';
          const dealInput: BitrixDealInput = {
            externalLeadId: local.external_lead_id,
            leadId: bitrixLeadId,
            title: local.deal_title ?? `Deal: ${local.full_name ?? mockLeadId}`,
            categoryId: this.categoryId,
            stageId,
            probability: Number(local.deal_probability ?? 0),
            amount: local.deal_amount === null ? null : Number(local.deal_amount),
            currency: local.deal_currency ?? 'VND',
          };
          bitrixDealId ??= await client.findDealByExternalId(local.external_lead_id);
          if (bitrixDealId) await client.updateDeal(bitrixDealId, dealInput);
          else bitrixDealId = await client.addDeal(dealInput);
        }
        await manager.query(
          `UPDATE bitrix_sync_state SET bitrix_lead_id = $2, bitrix_deal_id = $3,
                  status = 'synced', last_error = NULL, synced_at = now(), updated_at = now()
           WHERE mock_lead_id = $1`, [mockLeadId, bitrixLeadId, bitrixDealId],
        );
        return { enabled: true, mockLeadId, bitrixLeadId, bitrixDealId };
      });
      return result;
    } catch (error) {
      const safeError = error instanceof Error ? error.message.slice(0, 500) : 'Bitrix24 sync failed';
      await this.dataSource.query(
        `INSERT INTO bitrix_sync_state (mock_lead_id, status, last_error)
         VALUES ($1, 'failed', $2)
         ON CONFLICT (mock_lead_id) DO UPDATE
         SET status = 'failed', last_error = EXCLUDED.last_error, updated_at = now()`,
        [mockLeadId, safeError],
      ).catch(() => undefined);
      throw error;
    }
  }

  private validateId(id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid mock Lead ID');
  }
}
