import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { normalizeEmail, normalizePhone } from './identity';

export type MockLeadInput = {
  externalLeadId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adId: string | null;
  formId: string | null;
  city: string | null;
  ttclid: string | null;
  rawData: unknown;
  customFields?: Record<string, string | number | boolean>;
};

type ExistingLead = {
  id: string;
  normalized_email: string | null;
  normalized_phone: string | null;
};

@Injectable()
export class MockBitrixClient {
  async upsertLead(manager: EntityManager, input: MockLeadInput): Promise<string> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);

    // Ordered transaction locks serialize matching contacts across workers.
    const keys = [
      `external:${input.externalLeadId}`,
      ...(email ? [`email:${email}`] : []),
      ...(phone ? [`phone:${phone}`] : []),
    ].sort();
    for (const key of keys) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [key]);
    }

    const candidates = (await manager.query(
      `SELECT id::text, normalized_email, normalized_phone
       FROM mock_bitrix_leads
       WHERE id IN (
         SELECT lead_id FROM mock_bitrix_lead_external_ids WHERE external_lead_id = $1
       )
       OR ($2::text IS NOT NULL AND normalized_email = $2)
       OR ($3::text IS NOT NULL AND normalized_phone = $3)
       ORDER BY id FOR UPDATE`,
      [input.externalLeadId, email, phone],
    )) as ExistingLead[];

    const aliases = (await manager.query(
      'SELECT lead_id::text FROM mock_bitrix_lead_external_ids WHERE external_lead_id = $1',
      [input.externalLeadId],
    )) as Array<{ lead_id: string }>;
    if (candidates.length > 1 && !candidates.every(
      (candidate) => candidate.normalized_email === email && candidate.normalized_phone === phone,
    )) {
      throw new Error('Identity conflict: email and phone match different mock Leads');
    }

    // Existing identical historical mock Leads are not deleted or merged. An
    // existing external ID keeps its mapped Lead; a new ID uses the oldest one.
    const existing = candidates.find((candidate) => candidate.id === aliases[0]?.lead_id)
      ?? candidates[0];

    let id: string;
    let created = false;
    if (!existing) {
      const rows = (await manager.query(
        `INSERT INTO mock_bitrix_leads
           (external_lead_id, full_name, email, phone, campaign_id,
            normalized_email, normalized_phone, ad_id, form_id, city, ttclid, raw_data, campaign_name, custom_fields)
         VALUES ($1, $2, $3, $4, $5, $3, $4, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb)
         RETURNING id::text`,
        [input.externalLeadId, input.fullName, email, phone, input.campaignId,
          input.adId, input.formId, input.city, input.ttclid, JSON.stringify(input.rawData), input.campaignName,
          JSON.stringify(input.customFields ?? {})],
      )) as Array<{ id: string }>;
      id = rows[0].id;
      created = true;
    } else {
      if ((email && existing.normalized_email && email !== existing.normalized_email) ||
          (phone && existing.normalized_phone && phone !== existing.normalized_phone)) {
        throw new Error('Identity conflict: incoming contact differs from existing mock Lead');
      }
      id = existing.id;
      await manager.query(
        `UPDATE mock_bitrix_leads SET
           full_name = COALESCE(NULLIF(full_name, ''), $2),
           email = COALESCE(email, $3),
           phone = COALESCE(phone, $4),
           campaign_id = COALESCE(campaign_id, $5),
           campaign_name = COALESCE(campaign_name, $11),
           ad_id = COALESCE(ad_id, $6),
           form_id = COALESCE(form_id, $7),
           city = COALESCE(city, $8),
           ttclid = COALESCE(ttclid, $9),
           raw_data = COALESCE(raw_data, $10::jsonb),
           custom_fields = custom_fields || $12::jsonb,
           normalized_email = COALESCE(normalized_email, $3),
           normalized_phone = COALESCE(normalized_phone, $4),
           archived_at = NULL,
           updated_at = now()
         WHERE id = $1`,
        [id, input.fullName, email, phone, input.campaignId,
          input.adId, input.formId, input.city, input.ttclid, JSON.stringify(input.rawData), input.campaignName,
          JSON.stringify(input.customFields ?? {})],
      );
    }

    await manager.query(
      `INSERT INTO mock_bitrix_lead_external_ids (external_lead_id, lead_id)
       VALUES ($1, $2) ON CONFLICT (external_lead_id) DO NOTHING`,
      [input.externalLeadId, id],
    );
    await manager.query(
      `INSERT INTO mock_bitrix_api_calls (operation, request, response)
       VALUES ($1, $2::jsonb, $3::jsonb)`,
      ['crm.lead.upsert', JSON.stringify(input), JSON.stringify({ id, created })],
    );
    return id;
  }
}
