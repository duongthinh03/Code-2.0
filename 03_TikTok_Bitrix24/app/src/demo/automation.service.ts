import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

export function reportPeriod(now: Date): Date {
  const period = new Date(now);
  period.setUTCMinutes(0, 0, 0);
  return period;
}

export function shouldAlertLowConversion(leads: number, deals: number): boolean {
  return leads >= 5 && deals / leads < 0.2;
}

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastReportHour = '';

  constructor(private readonly db: DataSource) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 5000);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const hour = reportPeriod(new Date()).toISOString();
      if (hour !== this.lastReportHour) {
        await this.runReport();
        this.lastReportHour = hour;
      }
      for (let i = 0; i < 20; i++) {
        if (!await this.deliverOne()) break;
      }
    } catch (error) {
      this.logger.warn(`Automation cycle failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async runReport() {
    const period = reportPeriod(new Date());
    return this.db.transaction(async (manager) => {
      const totals = await manager.query(`
        SELECT (SELECT count(*)::int FROM mock_bitrix_leads WHERE archived_at IS NULL) AS leads,
               (SELECT count(*)::int FROM mock_bitrix_deals WHERE archived_at IS NULL) AS deals,
               (SELECT count(*)::int FROM mock_bitrix_deals WHERE status = 'won' AND archived_at IS NULL) AS won
      `) as Array<{ leads: number; deals: number; won: number }>;
      const summary = {
        ...totals[0],
        leadToDealRate: totals[0].leads ? totals[0].deals / totals[0].leads : 0,
        dealWonRate: totals[0].deals ? totals[0].won / totals[0].deals : 0,
        source: 'mock',
      };
      const inserted = await manager.query(
        `INSERT INTO scheduled_reports (period_start, summary) VALUES ($1, $2::jsonb)
         ON CONFLICT (period_start) DO NOTHING RETURNING id::text AS id`,
        [period, JSON.stringify(summary)],
      ) as Array<{ id: string }>;
      const rows = inserted.length ? inserted : await manager.query(
        'SELECT id::text AS id FROM scheduled_reports WHERE period_start = $1', [period],
      ) as Array<{ id: string }>;
      if (inserted.length && shouldAlertLowConversion(summary.leads, summary.deals)) {
        const message = `Mock alert: lead-to-deal conversion below 20% (${summary.deals}/${summary.leads})`;
        await manager.query(
          `INSERT INTO automation_alerts (report_id, kind, message)
           VALUES ($1, 'low_conversion', $2)`, [rows[0].id, message],
        );
        await manager.query(
          `INSERT INTO mock_outbound_events (kind, report_id, payload)
           VALUES ('notification.low_conversion', $1, $2::jsonb) ON CONFLICT DO NOTHING`,
          [rows[0].id, JSON.stringify({ reportId: rows[0].id, message, simulated: true })],
        );
      }
      return { reportId: rows[0].id, created: inserted.length > 0, periodStart: period, summary };
    });
  }

  async reports() {
    return this.db.query('SELECT id::text, period_start, summary, created_at FROM scheduled_reports ORDER BY id DESC LIMIT 100') as Promise<unknown[]>;
  }

  async alerts() {
    return this.db.query('SELECT id::text, report_id::text, kind, message, created_at FROM automation_alerts ORDER BY id DESC LIMIT 100') as Promise<unknown[]>;
  }

  async receipts() {
    return this.db.query(`
      SELECT r.id::text, r.outbound_event_id::text, r.destination, r.payload, r.delivered_at
      FROM mock_delivery_receipts r ORDER BY r.id DESC LIMIT 100
    `) as Promise<unknown[]>;
  }

  async replay(id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid outbound ID');
    const rows = await this.db.query(
      `UPDATE mock_outbound_events SET delivery_status = 'pending', attempts = 0,
              next_attempt_at = now(), last_error = NULL
       WHERE id = $1 AND delivery_status = 'failed' RETURNING id::text`, [id],
    ) as Array<{ id: string }>;
    if (!rows.length) throw new NotFoundException('Failed outbound event not found');
    return { id, queued: true };
  }

  async deliverPending() {
    let delivered = 0;
    for (let i = 0; i < 100; i++) {
      if (!await this.deliverOne()) break;
      delivered++;
    }
    return { inspected: delivered };
  }

  private async deliverOne(): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(`
        SELECT id::text, kind, payload, attempts FROM mock_outbound_events
        WHERE delivery_status = 'pending' AND next_attempt_at <= now()
        ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
      `) as Array<{ id: string; kind: string; payload: Record<string, unknown>; attempts: number }>;
      const event = rows[0];
      if (!event) return false;
      try {
        if (event.payload.simulateFailure === true) throw new Error('Simulated mock destination failure');
        const destination = event.kind.startsWith('tiktok.') ? 'mock-tiktok-conversions' : 'mock-notification-inbox';
        await manager.query(
          `INSERT INTO mock_delivery_receipts (outbound_event_id, destination, payload)
           VALUES ($1, $2, $3::jsonb) ON CONFLICT (outbound_event_id) DO NOTHING`,
          [event.id, destination, JSON.stringify(event.payload)],
        );
        await manager.query(
          `UPDATE mock_outbound_events SET delivery_status = 'delivered', attempts = attempts + 1,
                  delivered_at = now(), last_error = NULL WHERE id = $1`, [event.id],
        );
      } catch (error) {
        const attempts = event.attempts + 1;
        await manager.query(
          `UPDATE mock_outbound_events SET delivery_status = $2, attempts = $3,
                  next_attempt_at = now() + ($4::int * interval '1 second'), last_error = $5
           WHERE id = $1`,
          [event.id, attempts >= 3 ? 'failed' : 'pending', attempts, Math.pow(2, attempts), (error as Error).message],
        );
      }
      return true;
    });
  }
}
