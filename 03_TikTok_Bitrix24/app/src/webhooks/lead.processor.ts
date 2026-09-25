import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { MockBitrixClient } from './mock-bitrix.client';
import { mapLeadPayload } from './lead-mapping';
import { DemoService } from '../demo/demo.service';
import { BitrixSyncService } from '../bitrix/bitrix-sync.service';

type LeadJob = { eventId: string };
type StoredEvent = { payload: unknown; event_type: string; queue_status: string; mock_lead_id: string | null };

@Processor('leads')
export class LeadProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly bitrix: MockBitrixClient,
    private readonly demo: DemoService,
    private readonly bitrixSync: BitrixSyncService,
  ) {
    super();
  }

  async process(job: Job<LeadJob>): Promise<{ mockLeadId: string; alreadyProcessed: boolean }> {
    if (job.name !== 'mock-lead-received' || !job.data?.eventId) {
      throw new Error('Unsupported lead job');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT payload, event_type, queue_status, mock_lead_id::text
         FROM webhook_events WHERE event_id = $1 FOR UPDATE`,
        [job.data.eventId],
      )) as StoredEvent[];
      const event = rows[0];
      if (!event) throw new Error(`Webhook event not found: ${job.data.eventId}`);
      if (event.queue_status === 'processed' && event.mock_lead_id) {
        return { mockLeadId: event.mock_lead_id, alreadyProcessed: true };
      }

      if (event.event_type !== 'lead.generate') {
        const payload = event.payload as { data?: { lead_id?: unknown }; lead_data?: { lead_id?: unknown } };
        const externalLeadId = payload.data?.lead_id ?? payload.lead_data?.lead_id;
        if (typeof externalLeadId !== 'string' || !externalLeadId) {
          throw new UnrecoverableError('Engagement event requires data.lead_id');
        }
        const leads = (await manager.query(
          `SELECT lead_id::text AS lead_id FROM mock_bitrix_lead_external_ids
           WHERE external_lead_id = $1`, [externalLeadId],
        )) as Array<{ lead_id: string }>;
        if (!leads[0]) throw new UnrecoverableError('Lead for engagement event not found');
        await manager.query(
          `INSERT INTO lead_timeline (lead_id, event_type, source_event_id, details)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (lead_id, event_type, source_event_id) DO NOTHING`,
          [leads[0].lead_id, event.event_type, job.data.eventId, JSON.stringify(event.payload)],
        );
        await this.demo.refreshDealProbability(manager, leads[0].lead_id);
        await manager.query(
          `UPDATE webhook_events SET queue_status = 'processed', mock_lead_id = $2, last_error = NULL
           WHERE event_id = $1`, [job.data.eventId, leads[0].lead_id],
        );
        return { mockLeadId: leads[0].lead_id, alreadyProcessed: false };
      }

      let input;
      try { input = mapLeadPayload(event.payload, await this.demo.getMappings()); }
      catch (error) { throw new UnrecoverableError((error as Error).message); }
      let mockLeadId: string;
      try { mockLeadId = await this.bitrix.upsertLead(manager, input); }
      catch (error) {
        if ((error as Error).message.startsWith('Identity conflict:')) {
          throw new UnrecoverableError((error as Error).message);
        }
        throw error;
      }
      await manager.query(
        `INSERT INTO lead_timeline (lead_id, event_type, source_event_id, details)
         VALUES ($1, 'lead.synced', $2, $3::jsonb)
         ON CONFLICT (lead_id, event_type, source_event_id) DO NOTHING`,
        [mockLeadId, job.data.eventId, JSON.stringify({ campaignId: input.campaignId,
          adId: input.adId, formId: input.formId })],
      );
      await this.demo.maybeAutoConvert(manager, mockLeadId);
      await manager.query(
        `UPDATE webhook_events
         SET queue_status = 'processed', mock_lead_id = $2, last_error = NULL
         WHERE event_id = $1`,
        [job.data.eventId, mockLeadId],
      );
      return { mockLeadId, alreadyProcessed: false };
    });
    await this.bitrixSync.syncByMockLeadId(result.mockLeadId);
    await this.demo.invalidateReports();
    this.logger.log(`Processed mock lead event ${job.data.eventId} -> ${result.mockLeadId}`);
    return result;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<LeadJob> | undefined, error: Error): Promise<void> {
    if (!job?.data?.eventId) return;
    const events = await this.dataSource.query(
      'SELECT queue_status FROM webhook_events WHERE event_id = $1', [job.data.eventId],
    ) as Array<{ queue_status: string }>;
    // The mock transaction may have succeeded while the optional remote sync failed.
    // Its retry state lives in bitrix_sync_state, not the webhook dead-letter queue.
    if (events[0]?.queue_status === 'processed') {
      this.logger.error(`Bitrix24 sync failed for event ${job.data.eventId}: ${error.message}`);
      return;
    }
    const finalAttempt = error instanceof UnrecoverableError ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    await this.dataSource.query(
      `UPDATE webhook_events
       SET queue_status = CASE WHEN $2 THEN 'failed' ELSE queue_status END,
           last_error = $3
       WHERE event_id = $1 AND queue_status <> 'processed'`,
      [job.data.eventId, finalAttempt, error.message.slice(0, 1000)],
    );
    if (finalAttempt) {
      await this.dataSource.query(
        `INSERT INTO dead_letter_jobs (event_id, error) VALUES ($1, $2)
         ON CONFLICT (event_id) DO UPDATE SET error = EXCLUDED.error,
           failed_at = now(), replayed_at = NULL`,
        [job.data.eventId, error.message.slice(0, 1000)],
      );
    }
    this.logger.error(`Mock lead job failed for ${job.data.eventId}: ${error.message}`);
  }

}
