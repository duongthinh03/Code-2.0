class CreateWebhookEvents20260924000000 {
  name = 'CreateWebhookEvents20260924000000';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE webhook_events (
        event_id varchar(128) PRIMARY KEY,
        event_type varchar(64) NOT NULL,
        payload_sha256 char(64) NOT NULL,
        payload jsonb NOT NULL,
        queue_status varchar(16) NOT NULL DEFAULT 'pending',
        last_error text,
        received_at timestamptz NOT NULL DEFAULT now(),
        enqueued_at timestamptz,
        CONSTRAINT webhook_events_queue_status_check
          CHECK (queue_status IN ('pending', 'queued'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX webhook_events_queue_status_received_at_idx
      ON webhook_events (queue_status, received_at)
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('DROP TABLE webhook_events');
  }
}

module.exports = { CreateWebhookEvents20260924000000 };
