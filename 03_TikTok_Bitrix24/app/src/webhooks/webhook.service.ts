import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { isValidMockSignature } from './mock-signature';

type MockEvent = {
  event_id: string;
  event_type?: 'lead.generate' | 'form.complete' | 'user.interaction';
  event?: 'lead.generate' | 'form.complete' | 'user.interaction';
  data?: { lead_id?: string; [key: string]: unknown };
  lead_data?: Record<string, unknown>;
};

@Injectable()
export class WebhookService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @InjectQueue('leads') private readonly queue: Queue,
  ) {}

  async receive(
    rawBody: Buffer | undefined,
    timestamp: string | undefined,
    signature: string | undefined,
  ): Promise<{ eventId: string; duplicate: boolean; queued: boolean }> {
    if (!rawBody) throw new BadRequestException('Raw request body is required');

    const secret = this.config.getOrThrow<string>('MOCK_TIKTOK_WEBHOOK_SECRET');
    if (!isValidMockSignature(rawBody, timestamp, signature, secret)) {
      throw new UnauthorizedException('Invalid mock webhook signature or timestamp');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Request body must be JSON');
    }
    if (!this.isMockEvent(payload)) {
      throw new BadRequestException('Invalid mock TikTok event');
    }

    const hash = createHash('sha256').update(rawBody).digest('hex');
    const inserted = (await this.dataSource.query(
      `INSERT INTO webhook_events (event_id, event_type, payload_sha256, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [payload.event_id, payload.event_type ?? payload.event, hash, JSON.stringify(payload)],
    )) as Array<{ event_id: string }>;

    const duplicate = inserted.length === 0;
    if (duplicate) {
      const rows = (await this.dataSource.query(
        'SELECT payload_sha256, queue_status FROM webhook_events WHERE event_id = $1',
        [payload.event_id],
      )) as Array<{ payload_sha256: string; queue_status: string }>;
      if (rows[0]?.payload_sha256 !== hash) {
        throw new ConflictException('Event ID already exists with different payload');
      }
      if (rows[0].queue_status === 'queued' || rows[0].queue_status === 'processed') {
        return { eventId: payload.event_id, duplicate: true, queued: true };
      }
      if (rows[0].queue_status === 'failed') {
        throw new ServiceUnavailableException('Event processing failed; use the admin replay endpoint');
      }
    }

    try {
      const jobId = createHash('sha256').update(payload.event_id).digest('hex');
      await this.queue.add('mock-lead-received', { eventId: payload.event_id }, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: false,
      });
      await this.dataSource.query(
        `UPDATE webhook_events
         SET queue_status = 'queued', enqueued_at = now(), last_error = NULL
         WHERE event_id = $1 AND queue_status = 'pending'`,
        [payload.event_id],
      );
    } catch {
      await this.dataSource.query(
        `UPDATE webhook_events SET queue_status = 'pending', last_error = $2
         WHERE event_id = $1`,
        [payload.event_id, 'Could not enqueue event'],
      );
      throw new ServiceUnavailableException('Event saved but queue is unavailable; retry');
    }

    return { eventId: payload.event_id, duplicate, queued: true };
  }

  private isMockEvent(value: unknown): value is MockEvent {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const event = value as Record<string, unknown>;
    if (typeof event.event_id !== 'string' ||
        event.event_id.trim().length < 1 || event.event_id.length > 128) return false;
    const type = event.event_type ?? event.event;
    if (!['lead.generate', 'form.complete', 'user.interaction'].includes(String(type))) return false;
    const data = event.data ?? event.lead_data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (event.data) {
      const leadId = (event.data as Record<string, unknown>).lead_id;
      if (typeof leadId !== 'string' || !leadId.trim() || leadId.length > 128) return false;
    }
    return true;
  }
}
