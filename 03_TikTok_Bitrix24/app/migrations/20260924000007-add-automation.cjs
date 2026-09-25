class AddAutomation20260924000007 {
  name = 'AddAutomation20260924000007';

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE mock_outbound_events
      ADD COLUMN delivery_status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
      ADD COLUMN attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN last_error text,
      ADD COLUMN delivered_at timestamptz,
      ADD COLUMN report_id bigint
    `);
    await queryRunner.query(`
      CREATE TABLE scheduled_reports (
        id bigserial PRIMARY KEY,
        period_start timestamptz NOT NULL UNIQUE,
        summary jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE automation_alerts (
        id bigserial PRIMARY KEY,
        report_id bigint NOT NULL UNIQUE REFERENCES scheduled_reports(id),
        kind varchar(64) NOT NULL,
        message text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      ALTER TABLE mock_outbound_events
      ALTER COLUMN deal_id DROP NOT NULL,
      ADD CONSTRAINT mock_outbound_report_fk FOREIGN KEY (report_id) REFERENCES scheduled_reports(id),
      ADD CONSTRAINT mock_outbound_owner_ck CHECK (deal_id IS NOT NULL OR report_id IS NOT NULL)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX mock_outbound_kind_report_idx ON mock_outbound_events(kind, report_id)
      WHERE report_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX mock_outbound_pending_idx ON mock_outbound_events(next_attempt_at, id)
      WHERE delivery_status = 'pending'
    `);
    await queryRunner.query(`
      CREATE TABLE mock_delivery_receipts (
        id bigserial PRIMARY KEY,
        outbound_event_id bigint NOT NULL UNIQUE REFERENCES mock_outbound_events(id),
        destination varchar(64) NOT NULL,
        payload jsonb NOT NULL,
        delivered_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('DROP TABLE mock_delivery_receipts');
    await queryRunner.query('DROP INDEX mock_outbound_pending_idx');
    await queryRunner.query('DROP INDEX mock_outbound_kind_report_idx');
    await queryRunner.query('ALTER TABLE mock_outbound_events DROP CONSTRAINT mock_outbound_owner_ck, DROP CONSTRAINT mock_outbound_report_fk');
    await queryRunner.query('DROP TABLE automation_alerts');
    await queryRunner.query('DROP TABLE scheduled_reports');
    await queryRunner.query('ALTER TABLE mock_outbound_events DROP COLUMN delivery_status, DROP COLUMN attempts, DROP COLUMN next_attempt_at, DROP COLUMN last_error, DROP COLUMN delivered_at, DROP COLUMN report_id');
  }
}

module.exports = { AddAutomation20260924000007 };
