import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { MockBitrixClient } from './../src/webhooks/mock-bitrix.client';
import { BitrixSyncService } from './../src/bitrix/bitrix-sync.service';

async function removeQueuedJob(queue: Queue, jobId: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const job = await queue.getJob(jobId);
    if (!job) return;
    if (await job.getState() !== 'active') {
      try {
        await job.remove();
        return;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('locked by another worker')) throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting to remove test job ${jobId}`);
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const adminKey = 'test-admin-key-at-least-sixteen-characters';

  beforeEach(async () => {
    process.env.BITRIX_SYNC_ENABLED = 'false';
    process.env.ADMIN_API_KEY = adminKey;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    if (moduleFixture.get(BitrixSyncService).isEnabled()) {
      throw new Error('E2E tests must not use the real Bitrix24 sync');
    }

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET) checks PostgreSQL and Redis', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
      postgres: 'ok',
      redis: 'ok',
    });
  });

  it('creates a Redis-backed admin session and revokes it', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/api/v1/auth/session')
      .set('x-admin-key', adminKey).expect(201);
    const authorization = `Bearer ${login.body.accessToken as string}`;
    await request(server).get('/api/v1/config/rules')
      .set('authorization', authorization).expect(200);
    await request(server).post('/api/v1/auth/logout')
      .set('authorization', authorization).expect(201);
    await request(server).get('/api/v1/config/rules')
      .set('authorization', authorization).expect(401);
  });

  it('supports mock Lead and Deal CRUD with soft archive', async () => {
    const server = app.getHttpServer();
    const dataSource = app.get(DataSource);
    const externalLeadId = `crud-${randomUUID()}`;
    let leadId = '';
    try {
      const created = await request(server).post('/api/v1/leads')
        .set('x-admin-key', adminKey)
        .send({ externalLeadId, email: `${externalLeadId}@example.com`, fullName: 'CRUD demo' })
        .expect(201);
      leadId = created.body.id as string;
      const updated = await request(server).patch(`/api/v1/leads/${leadId}`)
        .set('x-admin-key', adminKey)
        .send({ city: 'Hanoi', customFields: { UF_CRM_SOURCE: 'admin-demo' } })
        .expect(200);
      expect(updated.body.custom_fields).toEqual({ UF_CRM_SOURCE: 'admin-demo' });
      const deal = await request(server).post(`/api/v1/leads/${leadId}/convert-to-deal`)
        .set('x-admin-key', adminKey).expect(201);
      const dealId = deal.body.id as string;
      await request(server).patch(`/api/v1/deals/${dealId}`)
        .set('x-admin-key', adminKey)
        .send({ stageId: 'CONTACTED', assignedTo: 'sales-demo-2', probability: 45 })
        .expect(200).then((response) => {
          expect(response.body.stage_id).toBe('CONTACTED');
          expect(response.body.assigned_to).toBe('sales-demo-2');
        });
      await request(server).delete(`/api/v1/deals/${dealId}`)
        .set('x-admin-key', adminKey).expect(200);
      await request(server).get(`/api/v1/deals/${dealId}`)
        .set('x-admin-key', adminKey).expect(404);
      await request(server).delete(`/api/v1/leads/${leadId}`)
        .set('x-admin-key', adminKey).expect(200);
      await request(server).get(`/api/v1/leads/${leadId}`)
        .set('x-admin-key', adminKey).expect(404);
    } finally {
      if (leadId) {
        await dataSource.query('DELETE FROM mock_bitrix_deals WHERE lead_id = $1', [leadId]);
        await dataSource.query('DELETE FROM mock_bitrix_leads WHERE id = $1', [leadId]);
      }
      await dataSource.query("DELETE FROM mock_bitrix_api_calls WHERE request->>'externalLeadId' = $1", [externalLeadId]);
    }
  });

  it('creates one hourly report and exposes mock delivery receipts', async () => {
    const server = app.getHttpServer();
    const first = await request(server).post('/api/v1/automation/run-report')
      .set('x-admin-key', adminKey).expect(201);
    const second = await request(server).post('/api/v1/automation/run-report')
      .set('x-admin-key', adminKey).expect(201);
    expect(second.body.reportId).toBe(first.body.reportId);
    expect(second.body.created).toBe(false);
    await request(server).get('/api/v1/automation/reports')
      .set('x-admin-key', adminKey).expect(200);
    await request(server).post('/api/v1/outbound-events/deliver-pending')
      .set('x-admin-key', adminKey).expect(201);
    await request(server).get('/api/v1/outbound-receipts')
      .set('x-admin-key', adminKey).expect(200);
  });

  it('retries failed mock delivery, dead-letters it, then replays to a receipt', async () => {
    const server = app.getHttpServer();
    const db = app.get(DataSource);
    const externalLeadId = `outbound-${randomUUID()}`;
    let leadId = '';
    let dealId = '';
    try {
      const leads = await db.query(
        `INSERT INTO mock_bitrix_leads (external_lead_id, email)
         VALUES ($1, $2) RETURNING id::text`, [externalLeadId, `${externalLeadId}@example.com`],
      ) as Array<{ id: string }>;
      leadId = leads[0].id;
      const deals = await db.query(
        `INSERT INTO mock_bitrix_deals (lead_id, title, pipeline_id, stage_id, probability)
         VALUES ($1, 'Outbound test', '1', 'NEW', 20) RETURNING id::text`, [leadId],
      ) as Array<{ id: string }>;
      dealId = deals[0].id;
      const outbound = await db.query(
        `INSERT INTO mock_outbound_events (kind, deal_id, payload)
         VALUES ('notification.test_retry', $1, '{"simulateFailure":true}'::jsonb)
         RETURNING id::text`, [dealId],
      ) as Array<{ id: string }>;
      const outboundId = outbound[0].id;
      for (let attempt = 0; attempt < 3; attempt++) {
        await db.query('UPDATE mock_outbound_events SET next_attempt_at = now() WHERE id = $1', [outboundId]);
        await request(server).post('/api/v1/outbound-events/deliver-pending')
          .set('x-admin-key', adminKey).expect(201);
      }
      const failed = await db.query(
        'SELECT delivery_status, attempts FROM mock_outbound_events WHERE id = $1', [outboundId],
      ) as Array<{ delivery_status: string; attempts: number }>;
      expect(failed[0].delivery_status).toBe('failed');
      expect(failed[0].attempts).toBe(3);
      await db.query(
        `UPDATE mock_outbound_events SET payload = '{"simulateFailure":false}'::jsonb WHERE id = $1`,
        [outboundId],
      );
      await request(server).post(`/api/v1/outbound-events/${outboundId}/replay`)
        .set('x-admin-key', adminKey).expect(201);
      await request(server).post('/api/v1/outbound-events/deliver-pending')
        .set('x-admin-key', adminKey).expect(201);
      const receipt = await db.query(
        'SELECT id FROM mock_delivery_receipts WHERE outbound_event_id = $1', [outboundId],
      ) as Array<{ id: string }>;
      expect(receipt).toHaveLength(1);
    } finally {
      if (dealId) await db.query('DELETE FROM mock_bitrix_deals WHERE id = $1', [dealId]);
      if (leadId) await db.query('DELETE FROM mock_bitrix_leads WHERE id = $1', [leadId]);
    }
  });

  it('accepts a signed mock event once and rejects bad signatures or ID conflicts', async () => {
    const eventId = `test-${randomUUID()}`;
    const externalLeadId = `lead-${eventId}`;
    const secret = process.env.MOCK_TIKTOK_WEBHOOK_SECRET!;
    const dataSource = app.get(DataSource);
    const queue = app.get<Queue>(getQueueToken('leads'));
    const jobId = createHash('sha256').update(eventId).digest('hex');
    const body = JSON.stringify({
      event_id: eventId,
      event_type: 'lead.generate',
      data: { lead_id: externalLeadId, email: `test+${eventId}@example.com` },
    });

    function send(raw: string, badSignature = false) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', secret)
        .update(`${timestamp}.${raw}`)
        .digest('hex');
      return request(app.getHttpServer())
        .post('/webhooks/tiktok/leads')
        .set('content-type', 'application/json')
        .set('x-mock-tiktok-timestamp', timestamp)
        .set('x-mock-tiktok-signature', badSignature ? '0'.repeat(64) : signature)
        .send(raw);
    }

    try {
      await send(body).expect(202).expect({ eventId, duplicate: false, queued: true });
      await send(body).expect(202).expect({ eventId, duplicate: true, queued: true });
      await send(body, true).expect(401);
      await send(body.replace(externalLeadId, `other-${externalLeadId}`)).expect(409);
      let rows: Array<{ event_id: string; queue_status: string }> = [];
      for (let attempt = 0; attempt < 30; attempt++) {
        rows = (await dataSource.query(
          'SELECT event_id, queue_status FROM webhook_events WHERE event_id = $1',
          [eventId],
        )) as Array<{ event_id: string; queue_status: string }>;
        if (rows[0]?.queue_status === 'processed') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(rows).toEqual([{ event_id: eventId, queue_status: 'processed' }]);
      const leads = (await dataSource.query(
        'SELECT id FROM mock_bitrix_leads WHERE external_lead_id = $1',
        [externalLeadId],
      )) as Array<{ id: string }>;
      expect(leads).toHaveLength(1);
      const calls = (await dataSource.query(
        "SELECT id FROM mock_bitrix_api_calls WHERE request->>'externalLeadId' = $1",
        [externalLeadId],
      )) as Array<{ id: string }>;
      expect(calls).toHaveLength(1);
      expect(await queue.getJob(jobId)).not.toBeNull();
    } finally {
      await removeQueuedJob(queue, jobId);
      await dataSource.query('DELETE FROM webhook_events WHERE event_id = $1', [eventId]);
      await dataSource.query(
        "DELETE FROM mock_bitrix_api_calls WHERE request->>'externalLeadId' = $1",
        [externalLeadId],
      );
      await dataSource.query('DELETE FROM mock_bitrix_leads WHERE external_lead_id = $1', [externalLeadId]);
    }
  });

  it('deduplicates different TikTok IDs by normalized email and phone', async () => {
    const token = randomUUID();
    const eventIds = [`test-a-${token}`, `test-b-${token}`, `test-c-${token}`];
    const externalIds = eventIds.map((id) => `lead-${id}`);
    const email = `test+${token}@example.com`;
    const phone = `09${parseInt(createHash('sha256').update(token).digest('hex').slice(0, 8), 16)
      .toString().slice(0, 8).padStart(8, '0')}`;
    const formattedPhone = `+84 ${phone.slice(1, 4)} ${phone.slice(4)}`;
    const secret = process.env.MOCK_TIKTOK_WEBHOOK_SECRET!;
    const dataSource = app.get(DataSource);
    const queue = app.get<Queue>(getQueueToken('leads'));

    async function send(index: number, data: Record<string, unknown>) {
      const body = JSON.stringify({
        event_id: eventIds[index],
        event_type: 'lead.generate',
        data: { lead_id: externalIds[index], ...data },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', secret)
        .update(`${timestamp}.${body}`)
        .digest('hex');
      await request(app.getHttpServer())
        .post('/webhooks/tiktok/leads')
        .set('content-type', 'application/json')
        .set('x-mock-tiktok-timestamp', timestamp)
        .set('x-mock-tiktok-signature', signature)
        .send(body)
        .expect(202);
    }

    try {
      await send(0, { full_name: 'Original Name', email: email.toUpperCase(), phone: formattedPhone });
      await send(1, { full_name: '', email, phone });
      await send(2, { phone });

      let rows: Array<{ mock_lead_id: string; queue_status: string }> = [];
      for (let attempt = 0; attempt < 40; attempt++) {
        rows = (await dataSource.query(
          `SELECT mock_lead_id::text, queue_status FROM webhook_events
           WHERE event_id = ANY($1::text[]) ORDER BY event_id`,
          [eventIds],
        )) as Array<{ mock_lead_id: string; queue_status: string }>;
        if (rows.length === 3 && rows.every((row) => row.queue_status === 'processed')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.queue_status === 'processed')).toBe(true);
      expect(new Set(rows.map((row) => row.mock_lead_id)).size).toBe(1);

      const leads = (await dataSource.query(
        'SELECT id, full_name, normalized_email, normalized_phone FROM mock_bitrix_leads WHERE normalized_email = $1',
        [email],
      )) as Array<{ id: string; full_name: string; normalized_email: string; normalized_phone: string }>;
      expect(leads).toHaveLength(1);
      expect(leads[0].full_name).toBe('Original Name');
      expect(leads[0].normalized_phone).toBe(`+84${phone.slice(1)}`);
      const aliases = (await dataSource.query(
        'SELECT external_lead_id FROM mock_bitrix_lead_external_ids WHERE lead_id = $1',
        [leads[0].id],
      )) as Array<{ external_lead_id: string }>;
      expect(aliases).toHaveLength(3);
    } finally {
      for (const eventId of eventIds) {
        await removeQueuedJob(queue, createHash('sha256').update(eventId).digest('hex'));
      }
      await dataSource.query('DELETE FROM webhook_events WHERE event_id = ANY($1::text[])', [eventIds]);
      await dataSource.query(
        "DELETE FROM mock_bitrix_api_calls WHERE request->>'externalLeadId' = ANY($1::text[])",
        [externalIds],
      );
      await dataSource.query('DELETE FROM mock_bitrix_leads WHERE normalized_email = $1', [email]);
    }
  });

  it('rejects contacts whose email and phone point to different mock Leads', async () => {
    const token = randomUUID();
    const emailA = `conflict-a-${token}@example.com`;
    const emailB = `conflict-b-${token}@example.com`;
    const phoneA = `09${parseInt(createHash('sha256').update(`a-${token}`).digest('hex').slice(0, 8), 16)
      .toString().slice(0, 8).padStart(8, '0')}`;
    const phoneB = `09${parseInt(createHash('sha256').update(`b-${token}`).digest('hex').slice(0, 8), 16)
      .toString().slice(0, 8).padStart(8, '0')}`;
    const externalIds = [`conflict-a-${token}`, `conflict-b-${token}`, `conflict-c-${token}`];
    const dataSource = app.get(DataSource);
    const client = app.get(MockBitrixClient);
    const input = (externalLeadId: string, email: string, phone: string) => ({
      externalLeadId,
      fullName: null,
      email,
      phone,
      campaignId: null,
      campaignName: null,
      adId: null,
      formId: null,
      city: null,
      ttclid: null,
      rawData: { event_id: externalLeadId },
    });

    try {
      await dataSource.transaction((manager) => client.upsertLead(manager, input(externalIds[0], emailA, phoneA)));
      await dataSource.transaction((manager) => client.upsertLead(manager, input(externalIds[1], emailB, phoneB)));
      await expect(dataSource.transaction((manager) =>
        client.upsertLead(manager, input(externalIds[2], emailA, phoneB)),
      )).rejects.toThrow('Identity conflict');
      const aliases = (await dataSource.query(
        'SELECT external_lead_id FROM mock_bitrix_lead_external_ids WHERE external_lead_id = ANY($1::text[])',
        [externalIds],
      )) as Array<{ external_lead_id: string }>;
      expect(aliases).toHaveLength(2);
    } finally {
      await dataSource.query(
        "DELETE FROM mock_bitrix_api_calls WHERE request->>'externalLeadId' = ANY($1::text[])",
        [externalIds],
      );
      await dataSource.query(
        'DELETE FROM mock_bitrix_leads WHERE external_lead_id = ANY($1::text[])',
        [externalIds.slice(0, 2)],
      );
    }
  });

  it('creates a mock Deal by rule and exposes analytics and CSV', async () => {
    const token = randomUUID();
    const eventId = `test-sale-${token}`;
    const externalLeadId = `lead-${eventId}`;
    const email = `sale-${token}@example.com`;
    const dataSource = app.get(DataSource);
    const queue = app.get<Queue>(getQueueToken('leads'));
    const jobId = createHash('sha256').update(eventId).digest('hex');
    const body = JSON.stringify({ event_id: eventId, event_type: 'lead.generate',
      data: { lead_id: externalLeadId, email, campaign_id: 'spring-sale' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', process.env.MOCK_TIKTOK_WEBHOOK_SECRET!)
      .update(`${timestamp}.${body}`).digest('hex');

    try {
      await request(app.getHttpServer()).get('/api/v1/config/rules').expect(401);
      await request(app.getHttpServer()).get('/api/v1/config/rules')
        .set('x-admin-key', adminKey).expect(200);
      await request(app.getHttpServer()).post('/webhooks/tiktok/leads')
        .set('content-type', 'application/json')
        .set('x-mock-tiktok-timestamp', timestamp)
        .set('x-mock-tiktok-signature', signature).send(body).expect(202);

      let rows: Array<{ mock_lead_id: string; queue_status: string }> = [];
      for (let attempt = 0; attempt < 40; attempt++) {
        rows = await dataSource.query(
          'SELECT mock_lead_id::text, queue_status FROM webhook_events WHERE event_id = $1', [eventId],
        ) as Array<{ mock_lead_id: string; queue_status: string }>;
        if (rows[0]?.queue_status === 'processed') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(rows[0]?.queue_status).toBe('processed');
      const leadId = rows[0].mock_lead_id;
      const deals = await dataSource.query(
        'SELECT id::text FROM mock_bitrix_deals WHERE lead_id = $1', [leadId],
      ) as Array<{ id: string }>;
      expect(deals).toHaveLength(1);
      await request(app.getHttpServer()).get('/api/v1/leads?page=1&limit=100&source=tiktok')
        .set('x-admin-key', adminKey).expect(200).then((response) => {
          expect(response.body.data.some((item: { id: string; quality_score: number }) =>
            item.id === leadId && item.quality_score === 20)).toBe(true);
        });
      await request(app.getHttpServer()).get('/api/v1/deals?status=open')
        .set('x-admin-key', adminKey).expect(200);
      const converted = await request(app.getHttpServer())
        .post(`/api/v1/leads/${leadId}/convert-to-deal`).set('x-admin-key', adminKey).expect(201);
      expect(converted.body.created).toBe(false);
      await request(app.getHttpServer()).get('/api/v1/analytics/conversion-rates')
        .set('x-admin-key', adminKey).expect(200).then((response) => {
          expect(response.body.deals).toBeGreaterThanOrEqual(1);
        });
      await request(app.getHttpServer()).get('/api/v1/analytics/campaign-performance')
        .set('x-admin-key', adminKey).expect(200);
      await request(app.getHttpServer()).get('/api/v1/reports/export?format=csv&date_range=30d')
        .set('x-admin-key', adminKey).expect(200).then((response) => {
          expect(response.text).toContain(email);
        });
      await request(app.getHttpServer()).get('/api/v1/reports/export?format=json&date_range=30d')
        .set('x-admin-key', adminKey).expect(200).then((response) => {
          expect(response.body.data.some((item: { email: string }) => item.email === email)).toBe(true);
        });
      await request(app.getHttpServer()).get('/api/v1/reports/export?format=xlsx&date_range=30d')
        .set('x-admin-key', adminKey).buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200).then((response) => {
          expect(response.headers['content-type']).toContain('spreadsheetml.sheet');
          expect(response.body.subarray(0, 2).toString()).toBe('PK');
        });
      await request(app.getHttpServer()).post('/webhooks/bitrix24/deals')
        .set('x-admin-key', adminKey).send({ deal_id: deals[0].id, status: 'won', amount: 1000000 })
        .expect(201);
      await request(app.getHttpServer()).post('/webhooks/bitrix24/deals')
        .set('x-admin-key', adminKey).send({ deal_id: deals[0].id, status: 'won', amount: 1000000 })
        .expect(201).then((response) => expect(response.body.duplicate).toBe(true));
      const outbound = await request(app.getHttpServer()).get('/api/v1/outbound-events')
        .set('x-admin-key', adminKey).expect(200);
      expect(outbound.body.filter((item: { deal_id: string; kind: string }) =>
        item.deal_id === deals[0].id && item.kind === 'tiktok.conversion')).toHaveLength(1);
    } finally {
      await removeQueuedJob(queue, jobId);
      await dataSource.query('DELETE FROM webhook_events WHERE event_id = $1', [eventId]);
      await dataSource.query('DELETE FROM mock_bitrix_deals WHERE lead_id IN (SELECT id FROM mock_bitrix_leads WHERE external_lead_id = $1)', [externalLeadId]);
      await dataSource.query(
        "DELETE FROM mock_bitrix_api_calls WHERE request->>'externalLeadId' = $1 OR request->>'leadId' IN (SELECT id::text FROM mock_bitrix_leads WHERE external_lead_id = $1)",
        [externalLeadId],
      );
      await dataSource.query('DELETE FROM mock_bitrix_leads WHERE external_lead_id = $1', [externalLeadId]);
    }
  });

  it('keeps an invalid contact in the dead-letter view without creating a Lead', async () => {
    const eventId = `test-invalid-${randomUUID()}`;
    const externalLeadId = `lead-${eventId}`;
    const dataSource = app.get(DataSource);
    const queue = app.get<Queue>(getQueueToken('leads'));
    const jobId = createHash('sha256').update(eventId).digest('hex');
    const body = JSON.stringify({ event_id: eventId, event_type: 'lead.generate',
      data: { lead_id: externalLeadId, email: 'invalid-email' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', process.env.MOCK_TIKTOK_WEBHOOK_SECRET!)
      .update(`${timestamp}.${body}`).digest('hex');
    try {
      await request(app.getHttpServer()).post('/webhooks/tiktok/leads')
        .set('content-type', 'application/json')
        .set('x-mock-tiktok-timestamp', timestamp)
        .set('x-mock-tiktok-signature', signature).send(body).expect(202);
      let rows: Array<{ queue_status: string }> = [];
      for (let attempt = 0; attempt < 40; attempt++) {
        rows = await dataSource.query(
          'SELECT queue_status FROM webhook_events WHERE event_id = $1', [eventId],
        ) as Array<{ queue_status: string }>;
        if (rows[0]?.queue_status === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(rows[0]?.queue_status).toBe('failed');
      const dead = await request(app.getHttpServer()).get('/api/v1/jobs/failed')
        .set('x-admin-key', adminKey).expect(200);
      expect(dead.body.some((item: { event_id: string }) => item.event_id === eventId)).toBe(true);
      const leads = await dataSource.query(
        'SELECT id FROM mock_bitrix_leads WHERE external_lead_id = $1', [externalLeadId],
      ) as unknown[];
      expect(leads).toHaveLength(0);
    } finally {
      await removeQueuedJob(queue, jobId);
      await dataSource.query('DELETE FROM webhook_events WHERE event_id = $1', [eventId]);
    }
  });

  it('accepts PDF-style Lead and records mock form and interaction events', async () => {
    const token = randomUUID();
    const eventIds = [`pdf-${token}`, `form-${token}`, `interaction-${token}`];
    const email = `pdf-${token}@example.com`;
    const dataSource = app.get(DataSource);
    const queue = app.get<Queue>(getQueueToken('leads'));
    async function send(payload: Record<string, unknown>) {
      const raw = JSON.stringify(payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', process.env.MOCK_TIKTOK_WEBHOOK_SECRET!)
        .update(`${timestamp}.${raw}`).digest('hex');
      await request(app.getHttpServer()).post('/webhooks/tiktok/leads')
        .set('content-type', 'application/json')
        .set('x-mock-tiktok-timestamp', timestamp)
        .set('x-mock-tiktok-signature', signature).send(raw).expect(202);
    }
    async function waitProcessed(eventId: string) {
      let rows: Array<{ queue_status: string; mock_lead_id: string }> = [];
      for (let attempt = 0; attempt < 40; attempt++) {
        rows = await dataSource.query(
          'SELECT queue_status, mock_lead_id::text FROM webhook_events WHERE event_id = $1', [eventId],
        ) as Array<{ queue_status: string; mock_lead_id: string }>;
        if (rows[0]?.queue_status === 'processed') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(rows[0]?.queue_status).toBe('processed');
      return rows[0].mock_lead_id;
    }

    try {
      await send({ event_id: eventIds[0], event: 'lead.generate',
        campaign: { campaign_id: `campaign-${token}`, campaign_name: 'Spring Sale 2024', ad_id: 'ad-1' },
        form: { form_id: 'form-1' }, lead_data: { full_name: 'PDF Lead', email } });
      const leadId = await waitProcessed(eventIds[0]);
      await send({ event_id: eventIds[1], event_type: 'form.complete', data: { lead_id: eventIds[0] } });
      await send({ event_id: eventIds[2], event_type: 'user.interaction', data: { lead_id: eventIds[0] } });
      await waitProcessed(eventIds[1]);
      await waitProcessed(eventIds[2]);
      const leads = await request(app.getHttpServer()).get('/api/v1/leads?limit=100')
        .set('x-admin-key', adminKey).expect(200);
      expect(leads.body.data.find((item: { id: string }) => item.id === leadId)?.quality_score).toBe(50);
      const deals = await dataSource.query('SELECT id FROM mock_bitrix_deals WHERE lead_id = $1', [leadId]) as unknown[];
      expect(deals).toHaveLength(1);
    } finally {
      for (const eventId of eventIds) {
        await removeQueuedJob(queue, createHash('sha256').update(eventId).digest('hex'));
      }
      await dataSource.query('DELETE FROM webhook_events WHERE event_id = ANY($1::text[])', [eventIds]);
      await dataSource.query('DELETE FROM mock_bitrix_deals WHERE lead_id IN (SELECT id FROM mock_bitrix_leads WHERE external_lead_id = $1)', [eventIds[0]]);
      await dataSource.query(
        "DELETE FROM mock_bitrix_api_calls WHERE request->>'externalLeadId' = $1 OR request->>'leadId' IN (SELECT id::text FROM mock_bitrix_leads WHERE external_lead_id = $1)",
        [eventIds[0]],
      );
      await dataSource.query('DELETE FROM mock_bitrix_leads WHERE external_lead_id = $1', [eventIds[0]]);
    }
  });

  it('validates and persists mapping and rule configuration', async () => {
    const server = app.getHttpServer();
    const originalMappings = (await request(server).get('/api/v1/config/mappings')
      .set('x-admin-key', adminKey).expect(200)).body as Record<string, string>;
    const originalRule = (await request(server).get('/api/v1/config/rules')
      .set('x-admin-key', adminKey).expect(200)).body as Record<string, unknown>;
    try {
      await request(server).put('/api/v1/config/mappings').set('x-admin-key', adminKey)
        .send({ email: '__proto__.polluted' }).expect(400);
      await request(server).put('/api/v1/config/mappings').set('x-admin-key', adminKey)
        .send({ customFields: { UF_CRM_UTM: 'data.utm_source' } }).expect(200);
      await request(server).put('/api/v1/config/mappings').set('x-admin-key', adminKey)
        .send({ email: 'lead_data.email' }).expect(200);
      const mappings = await request(server).get('/api/v1/config/mappings')
        .set('x-admin-key', adminKey).expect(200);
      expect(mappings.body.email).toBe('lead_data.email');
      await request(server).put('/api/v1/config/rules').set('x-admin-key', adminKey)
        .send({ probability: 101 }).expect(400);
      await request(server).put('/api/v1/config/rules').set('x-admin-key', adminKey)
        .send({ probability: 40 }).expect(200);
      const rule = await request(server).get('/api/v1/config/rules')
        .set('x-admin-key', adminKey).expect(200);
      expect(rule.body.probability).toBe(40);
    } finally {
      await request(server).put('/api/v1/config/mappings').set('x-admin-key', adminKey)
        .send(originalMappings).expect(200);
      await request(server).put('/api/v1/config/rules').set('x-admin-key', adminKey)
        .send(originalRule).expect(200);
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
