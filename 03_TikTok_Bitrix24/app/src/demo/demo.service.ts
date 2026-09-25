import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { defaultMappings, LeadMappings, validateMappings } from '../webhooks/lead-mapping';
import { ReportCacheService } from './report-cache.service';
import { MockBitrixClient } from '../webhooks/mock-bitrix.client';
import { mapLeadPayload } from '../webhooks/lead-mapping';
import { BitrixSyncService } from '../bitrix/bitrix-sync.service';

export type DealRule = {
  campaignContains: string;
  pipelineId: string;
  stageId: string;
  probability: number;
  assignedTo: string | null;
  assignmentCriteria: Array<{
    campaignContains?: string;
    cityEquals?: string;
    salesPersonId: string;
  }>;
  formCompletionBonus: number;
  interactionBonus: number;
};

const defaultRule: DealRule = {
  campaignContains: 'sale', pipelineId: '1', stageId: 'NEW',
  probability: 30, assignedTo: null,
  assignmentCriteria: [{ campaignContains: 'sale', salesPersonId: 'sales-demo-1' }],
  formCompletionBonus: 15, interactionBonus: 5,
};

export function resolveDealTerms(
  rule: DealRule,
  lead: { campaign_name: string | null; campaign_id: string | null; city: string | null },
  engagement: { forms: number; interactions: number },
): { assignedTo: string | null; probability: number } {
  const campaign = (lead.campaign_name ?? lead.campaign_id ?? '').toLowerCase();
  const city = (lead.city ?? '').toLowerCase();
  const match = rule.assignmentCriteria.find((criterion) =>
    (!criterion.campaignContains || campaign.includes(criterion.campaignContains.toLowerCase())) &&
    (!criterion.cityEquals || city === criterion.cityEquals.toLowerCase()));
  return {
    assignedTo: match?.salesPersonId ?? rule.assignedTo,
    probability: Math.min(100, rule.probability +
      engagement.forms * rule.formCompletionBonus +
      engagement.interactions * rule.interactionBonus),
  };
}

function validateRule(value: unknown): DealRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Rules must be an object');
  const item = { ...defaultRule, ...(value as Record<string, unknown>) };
  if (Object.keys(value).some((key) => !Object.keys(defaultRule).includes(key)) ||
      typeof item.campaignContains !== 'string' || item.campaignContains.length > 128 ||
      typeof item.pipelineId !== 'string' || !item.pipelineId || item.pipelineId.length > 64 ||
      typeof item.stageId !== 'string' || !item.stageId || item.stageId.length > 64 ||
      typeof item.probability !== 'number' || !Number.isInteger(item.probability) ||
      item.probability < 0 || item.probability > 100 ||
      (item.assignedTo !== null && (typeof item.assignedTo !== 'string' || item.assignedTo.length > 128)) ||
      !Number.isInteger(item.formCompletionBonus) || item.formCompletionBonus < 0 || item.formCompletionBonus > 100 ||
      !Number.isInteger(item.interactionBonus) || item.interactionBonus < 0 || item.interactionBonus > 100 ||
      !Array.isArray(item.assignmentCriteria) || item.assignmentCriteria.length > 20 ||
      item.assignmentCriteria.some((criterion) =>
        !criterion || typeof criterion !== 'object' || Array.isArray(criterion) ||
        Object.keys(criterion).some((key) => !['campaignContains', 'cityEquals', 'salesPersonId'].includes(key)) ||
        (!criterion.campaignContains && !criterion.cityEquals) ||
        (criterion.campaignContains !== undefined &&
          (typeof criterion.campaignContains !== 'string' || criterion.campaignContains.length > 128)) ||
        (criterion.cityEquals !== undefined &&
          (typeof criterion.cityEquals !== 'string' || criterion.cityEquals.length > 128)) ||
        typeof criterion.salesPersonId !== 'string' || !criterion.salesPersonId ||
        criterion.salesPersonId.length > 128)) {
    throw new BadRequestException('Invalid deal rule');
  }
  return item as DealRule;
}

@Injectable()
export class DemoService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue('leads') private readonly queue: Queue,
    private readonly cache: ReportCacheService,
    private readonly mockBitrix: MockBitrixClient,
    private readonly bitrixSync: BitrixSyncService,
  ) {}

  invalidateReports() { return this.cache.invalidate(); }

  async failedJobs() {
    return this.dataSource.query(
      `SELECT event_id, error, failed_at, replayed_at
       FROM dead_letter_jobs ORDER BY failed_at DESC LIMIT 100`,
    ) as Promise<unknown[]>;
  }

  async outboundEvents() {
    return this.dataSource.query(
      `SELECT id::text, kind, deal_id::text, report_id::text, payload, delivery_status,
              attempts, next_attempt_at, last_error, delivered_at, created_at
       FROM mock_outbound_events ORDER BY id DESC LIMIT 100`,
    ) as Promise<unknown[]>;
  }

  async replayFailed(eventId: string) {
    const rows = await this.dataSource.query(
      'SELECT queue_status FROM webhook_events WHERE event_id = $1', [eventId],
    ) as Array<{ queue_status: string }>;
    if (!rows[0]) throw new NotFoundException('Event not found');
    if (rows[0].queue_status !== 'failed') throw new BadRequestException('Event is not failed');
    const jobId = createHash('sha256').update(eventId).digest('hex');
    const existing = await this.queue.getJob(jobId);
    if (existing) await existing.remove();
    await this.dataSource.query(
      "UPDATE webhook_events SET queue_status = 'pending', last_error = NULL WHERE event_id = $1 AND queue_status = 'failed'",
      [eventId],
    );
    try {
      await this.queue.add('mock-lead-received', { eventId }, {
        jobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: false,
      });
      await this.dataSource.query(
        `UPDATE webhook_events SET queue_status = 'queued', enqueued_at = now()
         WHERE event_id = $1 AND queue_status = 'pending'`, [eventId],
      );
      await this.dataSource.query(
        'UPDATE dead_letter_jobs SET replayed_at = now() WHERE event_id = $1', [eventId],
      );
      return { eventId, queued: true };
    } catch {
      throw new ServiceUnavailableException('Could not requeue; event is pending');
    }
  }

  async getMappings(): Promise<LeadMappings> {
    const rows = (await this.dataSource.query("SELECT value FROM configurations WHERE key = 'mappings'")) as Array<{ value: unknown }>;
    return rows[0] ? validateMappings(rows[0].value) : defaultMappings;
  }

  async putMappings(value: unknown): Promise<LeadMappings> {
    let mappings: LeadMappings;
    try { mappings = validateMappings(value); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    await this.dataSource.query(
      `INSERT INTO configurations (key, value) VALUES ('mappings', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(mappings)],
    );
    return mappings;
  }

  async getRules(): Promise<DealRule> {
    const rows = (await this.dataSource.query("SELECT value FROM configurations WHERE key = 'rules'")) as Array<{ value: unknown }>;
    return rows[0] ? validateRule(rows[0].value) : defaultRule;
  }

  async putRules(value: unknown): Promise<DealRule> {
    const rule = validateRule(value);
    await this.dataSource.query(
      `INSERT INTO configurations (key, value) VALUES ('rules', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(rule)],
    );
    return rule;
  }

  async maybeAutoConvert(manager: EntityManager, leadId: string): Promise<void> {
    const rows = (await manager.query('SELECT campaign_id, campaign_name FROM mock_bitrix_leads WHERE id = $1', [leadId])) as Array<{ campaign_id: string | null; campaign_name: string | null }>;
    const rule = await this.getRules();
    const campaign = rows[0]?.campaign_name ?? rows[0]?.campaign_id;
    if (!rule.campaignContains || !campaign?.toLowerCase().includes(rule.campaignContains.toLowerCase())) return;
    await this.convert(manager, leadId, rule, 'automatic');
  }

  async convertManual(leadId: string): Promise<{ id: string; lead_id: string; created: boolean }> {
    if (!/^\d+$/.test(leadId)) throw new BadRequestException('Invalid Lead ID');
    const rule = await this.getRules();
    const result = await this.dataSource.transaction((manager) => this.convert(manager, leadId, rule, 'manual'));
    await this.cache.invalidate();
    await this.bitrixSync.syncByMockLeadId(leadId);
    return result;
  }

  private async convert(manager: EntityManager, leadId: string, rule: DealRule, mode: string) {
    const leads = (await manager.query(
      'SELECT id::text, full_name, campaign_name, campaign_id, city FROM mock_bitrix_leads WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [leadId],
    )) as Array<{ id: string; full_name: string | null; campaign_name: string | null; campaign_id: string | null; city: string | null }>;
    if (!leads[0]) throw new NotFoundException('Lead not found');
    const engagement = await this.engagementFor(manager, leadId);
    const terms = resolveDealTerms(rule, leads[0], engagement);
    const inserted = (await manager.query(
      `INSERT INTO mock_bitrix_deals (lead_id, title, pipeline_id, stage_id, probability, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (lead_id) DO NOTHING RETURNING id::text AS id`,
      [leadId, `Deal: ${leads[0].full_name ?? leadId}`, rule.pipelineId,
        rule.stageId, terms.probability, terms.assignedTo],
    )) as Array<{ id: string }>;
    const rows = (await manager.query(
      'SELECT id::text AS id, lead_id::text AS lead_id FROM mock_bitrix_deals WHERE lead_id = $1', [leadId],
    )) as Array<{ id: string; lead_id: string }>;
    await manager.query('UPDATE mock_bitrix_deals SET archived_at = NULL WHERE lead_id = $1', [leadId]);
    await manager.query("UPDATE mock_bitrix_leads SET status = 'converted', updated_at = now() WHERE id = $1", [leadId]);
    if (inserted.length) {
      await manager.query(
        'INSERT INTO lead_timeline (lead_id, event_type, details) VALUES ($1, $2, $3::jsonb)',
        [leadId, 'deal.created', JSON.stringify({ dealId: rows[0].id, mode })],
      );
      await manager.query(
        `INSERT INTO mock_bitrix_api_calls (operation, request, response)
         VALUES ('crm.deal.add', $1::jsonb, $2::jsonb)`,
        [JSON.stringify({ leadId, rule, mode }), JSON.stringify({ id: rows[0].id })],
      );
      await manager.query(
        `INSERT INTO mock_outbound_events (kind, deal_id, payload)
         VALUES ('notification.deal_created', $1, $2::jsonb) ON CONFLICT DO NOTHING`,
        [rows[0].id, JSON.stringify({ leadId, dealId: rows[0].id, mode })],
      );
    }
    return { ...rows[0], created: inserted.length > 0 };
  }

  async refreshDealProbability(manager: EntityManager, leadId: string): Promise<void> {
    const leads = await manager.query(
      'SELECT campaign_name, campaign_id, city FROM mock_bitrix_leads WHERE id = $1', [leadId],
    ) as Array<{ campaign_name: string | null; campaign_id: string | null; city: string | null }>;
    if (!leads[0]) return;
    const rule = await this.getRules();
    const engagement = await this.engagementFor(manager, leadId);
    const terms = resolveDealTerms(rule, leads[0], engagement);
    await manager.query(
      'UPDATE mock_bitrix_deals SET probability = $2, updated_at = now() WHERE lead_id = $1 AND archived_at IS NULL',
      [leadId, terms.probability],
    );
  }

  private async engagementFor(manager: EntityManager, leadId: string): Promise<{ forms: number; interactions: number }> {
    const rows = await manager.query(
      `SELECT count(*) FILTER (WHERE event_type = 'form.complete')::int AS forms,
              count(*) FILTER (WHERE event_type = 'user.interaction')::int AS interactions
       FROM lead_timeline WHERE lead_id = $1`, [leadId],
    ) as Array<{ forms: number; interactions: number }>;
    return rows[0];
  }

  async createLead(body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid Lead');
    const value = body as Record<string, unknown>;
    if (typeof value.externalLeadId !== 'string' || !value.externalLeadId ||
        value.externalLeadId.length > 128 ||
        Object.keys(value).some((key) => !['externalLeadId', 'fullName', 'email', 'phone',
          'campaignId', 'campaignName', 'adId', 'formId', 'city', 'ttclid'].includes(key))) {
      throw new BadRequestException('Invalid Lead fields');
    }
    let input;
    try {
      input = mapLeadPayload({ event_id: `admin-${value.externalLeadId}`, data: {
        lead_id: value.externalLeadId, full_name: value.fullName, email: value.email,
        phone: value.phone, campaign_id: value.campaignId, campaign_name: value.campaignName,
        ad_id: value.adId, form_id: value.formId, city: value.city, ttclid: value.ttclid,
      } }, defaultMappings);
    } catch (error) { throw new BadRequestException((error as Error).message); }
    let id: string;
    try { id = await this.dataSource.transaction((manager) => this.mockBitrix.upsertLead(manager, input)); }
    catch (error) {
      if ((error as Error).message.startsWith('Identity conflict:')) {
        throw new ConflictException((error as Error).message);
      }
      throw error;
    }
    await this.cache.invalidate();
    return { id, externalLeadId: input.externalLeadId };
  }

  async getLead(id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid Lead ID');
    const rows = await this.dataSource.query(
      `SELECT id::text, external_lead_id, full_name, email, phone, campaign_id,
              campaign_name, ad_id, form_id, city, ttclid, status, custom_fields,
              created_at, updated_at
       FROM mock_bitrix_leads WHERE id = $1 AND archived_at IS NULL`, [id],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new NotFoundException('Lead not found');
    return rows[0];
  }

  async updateLead(id: string, body: unknown) {
    if (!/^\d+$/.test(id) || !body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Invalid Lead update');
    }
    const value = body as Record<string, unknown>;
    const keys = Object.keys(value);
    if (!keys.length || keys.some((key) => !['fullName', 'city', 'customFields'].includes(key)) ||
        (value.fullName !== undefined && (typeof value.fullName !== 'string' || value.fullName.length > 255)) ||
        (value.city !== undefined && (typeof value.city !== 'string' || value.city.length > 255))) {
      throw new BadRequestException('Invalid Lead update fields');
    }
    const customFields = value.customFields ?? {};
    if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields) ||
        Object.keys(customFields).length > 20 ||
        Object.entries(customFields).some(([key, item]) =>
          !/^UF_CRM_[A-Z0-9_]{1,64}$/.test(key) ||
          !(typeof item === 'boolean' ||
            (typeof item === 'string' && item.length <= 255) ||
            (typeof item === 'number' && Number.isFinite(item))))) {
      throw new BadRequestException('Invalid custom fields');
    }
    const rows = await this.dataSource.query(
      `UPDATE mock_bitrix_leads SET full_name = COALESCE($2, full_name),
              city = COALESCE($3, city), custom_fields = custom_fields || $4::jsonb,
              updated_at = now() WHERE id = $1 AND archived_at IS NULL
       RETURNING id::text`,
      [id, value.fullName ?? null, value.city ?? null, JSON.stringify(customFields)],
    ) as Array<{ id: string }>;
    if (!rows[0]) throw new NotFoundException('Lead not found');
    await this.cache.invalidate();
    return this.getLead(id);
  }

  async archiveLead(id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid Lead ID');
    const archived = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `UPDATE mock_bitrix_leads SET archived_at = now(), updated_at = now()
         WHERE id = $1 AND archived_at IS NULL RETURNING id::text`, [id],
      ) as Array<{ id: string }>;
      if (!rows[0]) throw new NotFoundException('Lead not found');
      await manager.query(
        `UPDATE mock_bitrix_deals SET archived_at = now(), updated_at = now()
         WHERE lead_id = $1 AND archived_at IS NULL`, [id],
      );
      await manager.query(
        `INSERT INTO lead_timeline (lead_id, event_type, details)
         VALUES ($1, 'lead.archived', '{}'::jsonb)`, [id],
      );
      return { id, archived: true };
    });
    await this.cache.invalidate();
    return archived;
  }

  async getDeal(id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid Deal ID');
    const rows = await this.dataSource.query(
      `SELECT id::text, lead_id::text, title, pipeline_id, stage_id, probability,
              assigned_to, amount::text, currency, status, created_at, updated_at
       FROM mock_bitrix_deals WHERE id = $1 AND archived_at IS NULL`, [id],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new NotFoundException('Deal not found');
    return rows[0];
  }

  async updateDeal(id: string, body: unknown) {
    if (!/^\d+$/.test(id) || !body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Invalid Deal update');
    }
    const value = body as Record<string, unknown>;
    const keys = Object.keys(value);
    if (!keys.length || keys.some((key) => !['title', 'pipelineId', 'stageId', 'probability', 'assignedTo'].includes(key)) ||
        (value.title !== undefined && (typeof value.title !== 'string' || !value.title || value.title.length > 255)) ||
        (value.pipelineId !== undefined && (typeof value.pipelineId !== 'string' || !value.pipelineId || value.pipelineId.length > 64)) ||
        (value.stageId !== undefined && (typeof value.stageId !== 'string' || !value.stageId || value.stageId.length > 64)) ||
        (value.probability !== undefined && (!Number.isInteger(value.probability) || Number(value.probability) < 0 || Number(value.probability) > 100)) ||
        (value.assignedTo !== undefined && value.assignedTo !== null &&
          (typeof value.assignedTo !== 'string' || value.assignedTo.length > 128))) {
      throw new BadRequestException('Invalid Deal update fields');
    }
    const rows = await this.dataSource.query(
      `UPDATE mock_bitrix_deals SET title = COALESCE($2, title),
              pipeline_id = COALESCE($3, pipeline_id), stage_id = COALESCE($4, stage_id),
              probability = COALESCE($5, probability),
              assigned_to = CASE WHEN $6::boolean THEN $7 ELSE assigned_to END,
              updated_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING id::text`,
      [id, value.title ?? null, value.pipelineId ?? null, value.stageId ?? null,
        value.probability ?? null, keys.includes('assignedTo'), value.assignedTo ?? null],
    ) as Array<{ id: string }>;
    if (!rows[0]) throw new NotFoundException('Deal not found');
    await this.cache.invalidate();
    const deal = await this.getDeal(id) as { lead_id: string };
    await this.bitrixSync.syncByMockLeadId(deal.lead_id);
    return deal;
  }

  async archiveDeal(id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid Deal ID');
    const rows = await this.dataSource.query(
      `UPDATE mock_bitrix_deals SET archived_at = now(), updated_at = now()
       WHERE id = $1 AND archived_at IS NULL RETURNING id::text`, [id],
    ) as Array<{ id: string }>;
    if (!rows[0]) throw new NotFoundException('Deal not found');
    await this.cache.invalidate();
    return { id, archived: true };
  }

  async listLeads(page: number, limit: number) {
    const offset = (page - 1) * limit;
    const rows = await this.dataSource.query(
      `SELECT l.id::text, l.external_lead_id, l.full_name, l.email, l.phone,
              l.campaign_id, l.campaign_name, l.ad_id, l.form_id, l.city,
              l.status, l.custom_fields, l.created_at, l.updated_at,
              LEAST(100, 20 + 25 * coalesce(t.forms, 0) + 5 * coalesce(t.interactions, 0)) AS quality_score
       FROM mock_bitrix_leads l
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE event_type = 'form.complete')::int AS forms,
                count(*) FILTER (WHERE event_type = 'user.interaction')::int AS interactions
         FROM lead_timeline WHERE lead_id = l.id
       ) t ON true
       WHERE l.archived_at IS NULL ORDER BY l.id DESC LIMIT $1 OFFSET $2`, [limit, offset],
    ) as unknown[];
    const counts = await this.dataSource.query('SELECT count(*)::int AS total FROM mock_bitrix_leads WHERE archived_at IS NULL') as Array<{ total: number }>;
    return { data: rows, page, limit, total: counts[0].total };
  }

  async listDeals(status: string | undefined, assignedTo: string | undefined) {
    if (status && !['open', 'won', 'lost'].includes(status)) throw new BadRequestException('Invalid status');
    return this.dataSource.query(
      `SELECT id::text, lead_id::text, title, pipeline_id, stage_id, probability,
              assigned_to, amount::text, currency, status, created_at, updated_at
       FROM mock_bitrix_deals WHERE archived_at IS NULL AND ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR assigned_to = $2) ORDER BY id DESC LIMIT 1000`,
      [status ?? null, assignedTo ?? null],
    ) as Promise<unknown[]>;
  }

  async updateDealStatus(id: string, status: string, amount: unknown) {
    if (!/^\d+$/.test(id) || !['open', 'won', 'lost'].includes(status)) throw new BadRequestException('Invalid deal update');
    const parsedAmount = amount === undefined || amount === null ? null : Number(amount);
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) throw new BadRequestException('Invalid amount');
    const result = await this.dataSource.transaction(async (manager) => {
      const found = await manager.query(
        'SELECT lead_id::text AS lead_id, status, amount::text AS amount FROM mock_bitrix_deals WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [id],
      ) as Array<{ lead_id: string; status: string; amount: string | null }>;
      if (!found[0]) throw new NotFoundException('Deal not found');
      if (found[0].status === status &&
          (parsedAmount === null || Number(found[0].amount) === parsedAmount)) {
        return { id, lead_id: found[0].lead_id, status, amount: found[0].amount, duplicate: true };
      }
      await manager.query(
        `UPDATE mock_bitrix_deals SET status = $2, amount = COALESCE($3, amount), updated_at = now()
         WHERE id = $1`, [id, status, parsedAmount],
      );
      const rows = await manager.query(
        'SELECT id::text AS id, lead_id::text AS lead_id, status, amount::text AS amount FROM mock_bitrix_deals WHERE id = $1', [id],
      ) as Array<{ id: string; lead_id: string; status: string; amount: string | null }>;
      await manager.query(
        'INSERT INTO lead_timeline (lead_id, event_type, details) VALUES ($1, $2, $3::jsonb)',
        [rows[0].lead_id, 'deal.status', JSON.stringify({ dealId: id, status, amount: parsedAmount })],
      );
      if (status === 'won') {
        await manager.query(
          `INSERT INTO mock_outbound_events (kind, deal_id, payload)
           VALUES ('tiktok.conversion', $1, $2::jsonb),
                  ('notification.deal_won', $1, $3::jsonb)
           ON CONFLICT DO NOTHING`,
          [id, JSON.stringify({ dealId: id, leadId: rows[0].lead_id, amount: rows[0].amount,
            currency: 'VND', simulated: true }), JSON.stringify({ dealId: id, status: 'won' })],
        );
      }
      return rows[0];
    });
    await this.cache.invalidate();
    await this.bitrixSync.syncByMockLeadId(result.lead_id);
    return result;
  }

  async conversionRates() {
    return this.cache.remember('conversion', async () => {
      const rows = await this.dataSource.query(`
      SELECT (SELECT count(*)::int FROM mock_bitrix_leads WHERE archived_at IS NULL) AS leads,
             (SELECT count(*)::int FROM mock_bitrix_deals WHERE archived_at IS NULL) AS deals,
             (SELECT count(*)::int FROM mock_bitrix_deals WHERE status = 'won' AND archived_at IS NULL) AS won
    `) as Array<{ leads: number; deals: number; won: number }>;
      const { leads, deals, won } = rows[0];
      return { leads, deals, won, leadToDealRate: leads ? deals / leads : 0,
        dealWonRate: deals ? won / deals : 0, source: 'mock' };
    });
  }

  async campaignPerformance() {
    return this.cache.remember('campaigns', () => this.dataSource.query(`
      SELECT l.campaign_id, count(DISTINCT l.id)::int AS leads,
             count(DISTINCT d.id)::int AS deals,
             count(DISTINCT d.id) FILTER (WHERE d.status = 'won')::int AS won,
             c.amount::text AS cost,
             coalesce(sum(d.amount) FILTER (WHERE d.status = 'won'), 0)::text AS revenue,
             CASE WHEN c.amount IS NULL THEN NULL ELSE (c.amount / count(DISTINCT l.id))::text END AS cpl,
             CASE WHEN c.amount IS NULL OR c.amount = 0 THEN NULL
                  ELSE ((coalesce(sum(d.amount) FILTER (WHERE d.status = 'won'), 0) - c.amount) / c.amount)::text END AS roi
      FROM mock_bitrix_leads l
      LEFT JOIN mock_bitrix_deals d ON d.lead_id = l.id AND d.archived_at IS NULL
      LEFT JOIN campaign_costs c ON c.campaign_id = l.campaign_id
      WHERE l.campaign_id IS NOT NULL AND l.archived_at IS NULL
      GROUP BY l.campaign_id, c.amount ORDER BY leads DESC, l.campaign_id
    `) as Promise<unknown[]>);
  }

  async exportLeads(days: number) {
    return this.dataSource.query(
      `SELECT id::text, external_lead_id, full_name, email, phone, campaign_id, status, created_at
       FROM mock_bitrix_leads WHERE archived_at IS NULL
         AND created_at >= now() - ($1::int * interval '1 day') ORDER BY id`,
      [days],
    ) as Promise<Array<Record<string, unknown>>>;
  }
}
