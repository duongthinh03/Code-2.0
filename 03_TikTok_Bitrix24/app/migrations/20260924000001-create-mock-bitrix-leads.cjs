class CreateMockBitrixLeads20260924000001 {
  name = 'CreateMockBitrixLeads20260924000001';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE mock_bitrix_leads (
        id bigserial PRIMARY KEY,
        external_lead_id varchar(128) NOT NULL UNIQUE,
        full_name text,
        email text,
        phone text,
        campaign_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE mock_bitrix_api_calls (
        id bigserial PRIMARY KEY,
        operation varchar(64) NOT NULL,
        request jsonb NOT NULL,
        response jsonb NOT NULL,
        called_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      ALTER TABLE webhook_events
      ADD COLUMN mock_lead_id bigint REFERENCES mock_bitrix_leads(id)
    `);
    await queryRunner.query(`
      ALTER TABLE webhook_events DROP CONSTRAINT webhook_events_queue_status_check
    `);
    await queryRunner.query(`
      ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_queue_status_check
      CHECK (queue_status IN ('pending', 'queued', 'processed', 'failed'))
    `);
    await queryRunner.query(`
      CREATE INDEX mock_bitrix_leads_email_idx ON mock_bitrix_leads (lower(email))
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('ALTER TABLE webhook_events DROP CONSTRAINT webhook_events_queue_status_check');
    await queryRunner.query(`
      ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_queue_status_check
      CHECK (queue_status IN ('pending', 'queued'))
    `);
    await queryRunner.query('ALTER TABLE webhook_events DROP COLUMN mock_lead_id');
    await queryRunner.query('DROP TABLE mock_bitrix_api_calls');
    await queryRunner.query('DROP TABLE mock_bitrix_leads');
  }
}

module.exports = { CreateMockBitrixLeads20260924000001 };
