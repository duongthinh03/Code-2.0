class AddDemoFeatures20260924000003 {
  name = 'AddDemoFeatures20260924000003';

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE mock_bitrix_leads
      ADD COLUMN ad_id text,
      ADD COLUMN form_id text,
      ADD COLUMN city text,
      ADD COLUMN ttclid text,
      ADD COLUMN status varchar(32) NOT NULL DEFAULT 'new',
      ADD COLUMN raw_data jsonb
    `);
    await queryRunner.query(`
      CREATE TABLE configurations (
        key varchar(64) PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO configurations (key, value) VALUES
      ('mappings', '{"externalLeadId":"data.lead_id","fullName":"data.full_name","email":"data.email","phone":"data.phone","campaignId":"data.campaign_id","adId":"data.ad_id","formId":"data.form_id","city":"data.city","ttclid":"data.ttclid"}'::jsonb),
      ('rules', '{"campaignContains":"sale","pipelineId":"1","stageId":"NEW","probability":30,"assignedTo":null}'::jsonb)
    `);
    await queryRunner.query(`
      CREATE TABLE mock_bitrix_deals (
        id bigserial PRIMARY KEY,
        lead_id bigint NOT NULL UNIQUE REFERENCES mock_bitrix_leads(id),
        title text NOT NULL,
        pipeline_id varchar(64) NOT NULL,
        stage_id varchar(64) NOT NULL,
        probability integer NOT NULL CHECK (probability BETWEEN 0 AND 100),
        assigned_to varchar(128),
        amount numeric(14,2),
        currency char(3) NOT NULL DEFAULT 'VND',
        status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX mock_bitrix_deals_status_assigned_idx ON mock_bitrix_deals(status, assigned_to)
    `);
    await queryRunner.query(`
      CREATE TABLE lead_timeline (
        id bigserial PRIMARY KEY,
        lead_id bigint NOT NULL REFERENCES mock_bitrix_leads(id) ON DELETE CASCADE,
        event_type varchar(64) NOT NULL,
        source_event_id varchar(128),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (lead_id, event_type, source_event_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE campaign_costs (
        campaign_id text PRIMARY KEY,
        amount numeric(14,2) NOT NULL CHECK (amount >= 0),
        currency char(3) NOT NULL DEFAULT 'VND',
        note text NOT NULL DEFAULT 'mock',
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX mock_bitrix_leads_campaign_idx ON mock_bitrix_leads(campaign_id, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE dead_letter_jobs (
        event_id varchar(128) PRIMARY KEY REFERENCES webhook_events(event_id) ON DELETE CASCADE,
        error text NOT NULL,
        failed_at timestamptz NOT NULL DEFAULT now(),
        replayed_at timestamptz
      )
    `);
    await queryRunner.query(`
      INSERT INTO dead_letter_jobs (event_id, error)
      SELECT event_id, coalesce(last_error, 'Unknown error') FROM webhook_events WHERE queue_status = 'failed'
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('DROP TABLE dead_letter_jobs');
    await queryRunner.query('DROP INDEX mock_bitrix_leads_campaign_idx');
    await queryRunner.query('DROP TABLE campaign_costs');
    await queryRunner.query('DROP TABLE lead_timeline');
    await queryRunner.query('DROP TABLE mock_bitrix_deals');
    await queryRunner.query('DROP TABLE configurations');
    await queryRunner.query('ALTER TABLE mock_bitrix_leads DROP COLUMN ad_id, DROP COLUMN form_id, DROP COLUMN city, DROP COLUMN ttclid, DROP COLUMN status, DROP COLUMN raw_data');
  }
}

module.exports = { AddDemoFeatures20260924000003 };
