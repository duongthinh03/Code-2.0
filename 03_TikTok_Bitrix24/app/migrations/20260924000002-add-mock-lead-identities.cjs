class AddMockLeadIdentities20260924000002 {
  name = 'AddMockLeadIdentities20260924000002';

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE mock_bitrix_leads
      ADD COLUMN normalized_email text,
      ADD COLUMN normalized_phone text
    `);
    await queryRunner.query(`
      UPDATE mock_bitrix_leads
      SET normalized_email = lower(nullif(trim(email), '')),
          normalized_phone = CASE
            WHEN left(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 2) = '84'
                 AND length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) BETWEEN 11 AND 12
            THEN '0' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 3)
            ELSE nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')
          END
    `);
    await queryRunner.query(`
      CREATE INDEX mock_bitrix_leads_normalized_email_idx
      ON mock_bitrix_leads (normalized_email) WHERE normalized_email IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX mock_bitrix_leads_normalized_phone_idx
      ON mock_bitrix_leads (normalized_phone) WHERE normalized_phone IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE mock_bitrix_lead_external_ids (
        external_lead_id varchar(128) PRIMARY KEY,
        lead_id bigint NOT NULL REFERENCES mock_bitrix_leads(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO mock_bitrix_lead_external_ids (external_lead_id, lead_id)
      SELECT external_lead_id, id FROM mock_bitrix_leads
    `);
    await queryRunner.query(`
      CREATE INDEX mock_bitrix_lead_external_ids_lead_id_idx
      ON mock_bitrix_lead_external_ids (lead_id)
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('DROP TABLE mock_bitrix_lead_external_ids');
    await queryRunner.query('DROP INDEX mock_bitrix_leads_normalized_phone_idx');
    await queryRunner.query('DROP INDEX mock_bitrix_leads_normalized_email_idx');
    await queryRunner.query('ALTER TABLE mock_bitrix_leads DROP COLUMN normalized_phone, DROP COLUMN normalized_email');
  }
}

module.exports = { AddMockLeadIdentities20260924000002 };
