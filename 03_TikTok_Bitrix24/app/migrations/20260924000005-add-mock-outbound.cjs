class AddMockOutbound20260924000005 {
  name = 'AddMockOutbound20260924000005';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE mock_outbound_events (
        id bigserial PRIMARY KEY,
        kind varchar(64) NOT NULL,
        deal_id bigint NOT NULL REFERENCES mock_bitrix_deals(id) ON DELETE CASCADE,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (kind, deal_id)
      )
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('DROP TABLE mock_outbound_events');
  }
}

module.exports = { AddMockOutbound20260924000005 };
